package com.pixeeee.schoolnfc.cloud

import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import com.pixeeee.schoolnfc.device.DevicePreferences
import kotlinx.coroutines.tasks.await
import java.time.Instant
import java.time.ZoneId
import java.util.Date

// Spark uses rules-protected documents; it never calls a billable Cloud Function.
class SparkGateway(private val preferences: DevicePreferences) {
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val uid: String get() = requireNotNull(auth.currentUser?.uid) { "Sign in first." }
    private fun school(id: String) = db.collection("schools").document(id)
    private fun text(data: Map<String, Any?>, key: String) = data[key]?.toString()?.trim()?.takeIf { it.isNotEmpty() } ?: error("$key is required.")
    private fun iso(value: Any?): String? = (value as? Timestamp)?.toDate()?.toInstant()?.toString()

    suspend fun call(name: String, data: Map<String, Any?>): Map<String, Any?> {
        val schoolId = data["schoolId"]?.toString() ?: preferences.schoolId ?: error("Choose a school first.")
        return when (name) {
            "registerDevice" -> register(schoolId, text(data, "displayName"))
            "renewDeviceLease" -> renew(schoolId)
            "getTeacherSetup" -> setup(schoolId)
            "updateSubject" -> updateSubject(schoolId, data)
            "subjectAttendance" -> subjectAttendance(schoolId, data)
            "claimDismissal" -> claimDismissal(schoolId, data)
            "dismissalPreview" -> dismissalPreview(schoolId, data)
            "createTeacherSection" -> createSection(schoolId, data)
            "createTeacherStudent" -> createStudent(schoolId, data)
            "getDeviceSnapshot" -> snapshot(schoolId, data)
            "ingestAttendanceBatch" -> attendance(schoolId, data)
            "ingestSmsResults" -> sms(schoolId, data)
            else -> error("$name requires the original Functions backend. Spark supports teacher roll call and existing NFC cards.")
        }
    }

    private suspend fun membership(schoolId: String) {
        val member = school(schoolId).collection("members").document(uid).get(Source.SERVER).await()
        require(member.getString("status") == "ACTIVE" && member.getString("role") in setOf("TEACHER", "SCHOOL_ADMIN")) { "An active teacher account is required. Ask the school administrator to provision it." }
    }

    private suspend fun authorized(schoolId: String) { membership(schoolId) }

    private suspend fun sections(schoolId: String): List<Map<String, Any?>> {
        val root = school(schoolId)
        val collection = root.collection("sparkSections")
        val docs = listOf(collection.whereEqualTo("teacherId", uid), collection.whereEqualTo("adviserId", uid), collection.whereArrayContains("subjectTeacherIds", uid))
            .flatMap { it.get(Source.SERVER).await().documents }.distinctBy { it.id }
        return docs.filter { it.getBoolean("active") == true && ((it.getString("adviserId") ?: it.getString("teacherId")) == uid || (it.get("subjectTeacherIds") as? List<*>)?.contains(uid) == true) }.map { doc ->
            val adviser = doc.getString("adviserId") ?: doc.getString("teacherId")
            var query = root.collection("sparkSubjects").whereEqualTo("sectionId", doc.id)
            if (adviser != uid) query = query.whereEqualTo("teacherId", uid)
            doc.data.orEmpty() + mapOf("id" to doc.id, "adviserId" to adviser, "subjects" to query.get(Source.SERVER).await().documents.filter { it.getBoolean("active") == true }.map { it.data.orEmpty() + mapOf("id" to it.id, "isAssigned" to (it.getString("teacherId") == uid)) })
        }
    }

    private suspend fun updateSubject(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        membership(schoolId)
        val ref = school(schoolId).collection("sparkSubjects").document(text(data, "subjectId"))
        val name = text(data, "name"); val start = text(data, "startTime"); val end = text(data, "endTime")
        require(name.length <= 80 && Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(start) && Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(end) && end > start) { "Use a name and start/end times in order." }
        db.runTransaction { tx ->
            require(tx.get(ref).getString("teacherId") == uid) { "Only the assigned subject teacher can edit its schedule." }
            tx.update(ref, mapOf("name" to name, "startTime" to start, "endTime" to end))
        }.await()
        return mapOf("subjectId" to ref.id)
    }

    private suspend fun subjectAttendance(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        membership(schoolId)
        val sectionId = text(data, "sectionId"); val root = school(schoolId)
        val section = root.collection("sparkSections").document(sectionId).get(Source.SERVER).await()
        val adviser = section.getString("adviserId") ?: section.getString("teacherId")
        var query = root.collection("sparkAttendance").whereEqualTo("sectionId", sectionId).whereEqualTo("localSchoolDate", text(data, "date"))
        if (adviser != uid) query = query.whereEqualTo("teacherId", uid)
        return mapOf("attendance" to query.get(Source.SERVER).await().documents.map { it.data.orEmpty() + ("id" to it.id) })
    }

    private suspend fun dismissalRecipients(schoolId: String, sectionId: String): List<String> {
        val root = school(schoolId)
        val section = root.collection("sparkSections").document(sectionId).get(Source.SERVER).await()
        require(section.getBoolean("active") == true && (section.getString("adviserId") ?: section.getString("teacherId")) == uid) { "Only the adviser can dismiss this section." }
        return root.collection("sparkStudents").whereEqualTo("sectionId", sectionId).whereEqualTo("status", "ACTIVE").get(Source.SERVER).await().documents
            .filter { it.getBoolean("parentConsent") == true && it.getBoolean("parentPhoneVerified") == true && it.getString("parentPhone")?.matches(Regex("^\\+639\\d{9}$")) == true }.map { it.id }
    }
    private suspend fun dismissalPreview(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        membership(schoolId)
        return mapOf("count" to dismissalRecipients(schoolId, text(data, "sectionId")).size)
    }

    private suspend fun claimDismissal(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        membership(schoolId)
        val sectionId = text(data, "sectionId"); val date = text(data, "date"); val root = school(schoolId)
        val zone = ZoneId.of(root.get(Source.SERVER).await().getString("timeZone") ?: "Asia/Manila")
        require(java.time.LocalDate.now(zone).toString() == date) { "The school date changed. Refresh before Out." }
        val ref = root.collection("sparkDismissals").document("${sectionId}_$date")
        val recipients = dismissalRecipients(schoolId, sectionId)
        val expected = (data["expectedCount"] as? Number)?.toInt() ?: error("Confirm the recipient count first.")
        val claim = db.runTransaction { tx ->
            val old = tx.get(ref)
            val section = tx.get(root.collection("sparkSections").document(sectionId))
            require(section.getBoolean("active") == true && (section.getString("adviserId") ?: section.getString("teacherId")) == uid) { "Only the adviser can dismiss the section." }
            if (old.exists()) {
                require(old.getString("teacherId") == uid && old.getString("deviceId") == preferences.deviceId) { "Out was already recorded for this section today on another phone." }
                old.data.orEmpty()
            } else {
                require(expected == recipients.size) { "Parent contacts changed. Review the recipient count again." }
                val values = mapOf("studentIds" to recipients, "sectionId" to sectionId, "localSchoolDate" to date, "teacherId" to uid, "deviceId" to preferences.deviceId, "localTimestamp" to Instant.ofEpochMilli(System.currentTimeMillis()).toString(), "createdAt" to FieldValue.serverTimestamp())
                tx.set(ref, values); values
            }
        }.await()
        return claim
    }

    private suspend fun register(schoolId: String, name: String): Map<String, Any?> {
        membership(schoolId)
        require(name.length <= 80) { "Phone name must be at most 80 characters." }
        val ref = school(schoolId).collection("sparkDevices").document(preferences.deviceId)
        val status = db.runTransaction { tx ->
            val old = tx.get(ref)
            if (old.exists()) {
                require(old.getString("assignedUserId") == uid) { "This phone is assigned to another account." }
                old.getString("status") ?: "PENDING"
            } else {
                tx.set(ref, mapOf("assignedUserId" to uid, "displayName" to name, "status" to "PENDING", "createdAt" to FieldValue.serverTimestamp(), "leaseExpiresAt" to Timestamp(Date(0))))
                "PENDING"
            }
        }.await()
        return mapOf("deviceId" to ref.id, "status" to status)
    }

    private suspend fun renew(schoolId: String): Map<String, Any?> {
        membership(schoolId)
        val expires = Instant.now().plusSeconds(6 * 86400)
        return mapOf("leaseId" to preferences.deviceId, "expiresAt" to expires.toString(), "sectionIds" to sections(schoolId).map { it["id"] })
    }

    private suspend fun setup(schoolId: String): Map<String, Any?> {
        authorized(schoolId)
        val root = school(schoolId)
        fun named(docs: List<com.google.firebase.firestore.DocumentSnapshot>) = docs.filter { it.getBoolean("active") == true }.map { mapOf("id" to it.id, "name" to (it.getString("name") ?: it.id)) }
        return mapOf("sections" to sections(schoolId),
            "academicYears" to named(root.collection("academicYears").get(Source.SERVER).await().documents),
            "gradeLevels" to named(root.collection("gradeLevels").get(Source.SERVER).await().documents))
    }

    private suspend fun createSection(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        authorized(schoolId)
        val id = text(data, "requestId"); java.util.UUID.fromString(id)
        val name = text(data, "name"); require(name.length <= 80)
        val year = text(data, "academicYearId"); val grade = text(data, "gradeLevelId")
        val root = school(schoolId); val ref = root.collection("sparkSections").document(id)
        db.runTransaction { tx ->
            val old = tx.get(ref)
            if (old.exists()) {
                require(old.getString("teacherId") == uid && old.getString("name") == name && old.getString("gradeLevelId") == grade && old.getString("academicYearId") == year) { "This request already created a different section." }
            } else {
                require(tx.get(root.collection("academicYears").document(year)).getBoolean("active") == true)
                require(tx.get(root.collection("gradeLevels").document(grade)).getBoolean("active") == true)
                tx.set(ref, mapOf("name" to name, "teacherId" to uid, "adviserId" to uid, "academicYearId" to year, "gradeLevelId" to grade,
                    "active" to true, "deviceId" to preferences.deviceId, "createdAt" to FieldValue.serverTimestamp()))
            }
        }.await()
        return mapOf("sectionId" to id)
    }

    private suspend fun createStudent(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        authorized(schoolId)
        val id = text(data, "requestId"); java.util.UUID.fromString(id)
        val section = text(data, "sectionId")
        val number = text(data, "studentNumber").uppercase(java.util.Locale.ROOT)
        require(Regex("^[A-Z0-9][A-Z0-9_-]{0,39}$").matches(number)) { "Use letters, digits, dashes or underscores in the student number." }
        val first = text(data, "firstName"); val last = text(data, "lastName"); val parent = text(data, "parentName")
        require(listOf(first, last, parent).all { it.length <= 120 }) { "Names must be at most 120 characters." }
        val phone = normalizePhone(text(data, "parentPhone"))
        require(data["parentPhoneVerified"] == true && data["parentConsent"] == true) { "Check the parent number and record consent first." }
        val root = school(schoolId); val ref = root.collection("sparkStudents").document(id)
        val index = root.collection("sparkStudentNumbers").document(number)
        val values = mapOf("sectionId" to section, "studentNumber" to number, "firstName" to first, "lastName" to last,
            "displayName" to "$first $last", "parentName" to parent, "parentPhone" to phone, "parentPhoneVerified" to true,
            "parentConsent" to true, "status" to "ACTIVE", "createdBy" to uid, "deviceId" to preferences.deviceId)
        db.runTransaction { tx ->
            val old = tx.get(ref)
            if (old.exists()) {
                require(values.all { (key, value) -> old.get(key) == value }) { "This request already created a different student." }
            } else {
                val sectionDoc = tx.get(root.collection("sparkSections").document(section))
                require((sectionDoc.getString("adviserId") ?: sectionDoc.getString("teacherId")) == uid && sectionDoc.getBoolean("active") == true) { "Choose one of your active sections." }
                require(!tx.get(index).exists()) { "Student number is already registered." }
                tx.set(ref, values + ("createdAt" to FieldValue.serverTimestamp()))
                tx.set(index, mapOf("studentId" to id, "sectionId" to section))
            }
        }.await()
        return mapOf("studentId" to id, "guardianId" to "${id}_parent")
    }

    private suspend fun snapshot(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        authorized(schoolId)
        val root = school(schoolId); val kind = text(data, "kind")
        val ids = sections(schoolId).map { it["id"].toString() }
        val cursor = data["cursor"]?.toString()?.takeIf { it != "null" }
        val size = (data["pageSize"] as? Number)?.toInt()?.coerceIn(1, 500) ?: 250
        if (kind == "CONFIG") {
            val schoolData = root.get(Source.SERVER).await().data.orEmpty()
            return mapOf("items" to listOf(mapOf("school" to schoolData)), "nextCursor" to null)
        }
        if (kind == "SECTIONS") return mapOf("items" to sections(schoolId), "nextCursor" to null)
        if (kind == "TEMPLATES") return mapOf("items" to root.collection("smsTemplates").get(Source.SERVER).await().documents.map { it.data.orEmpty() + ("id" to it.id) }, "nextCursor" to null)
        require(kind in setOf("STUDENTS", "GUARDIANS", "CARDS")) { "Unknown snapshot kind." }
        if (ids.isEmpty()) return mapOf("items" to emptyList<Any>(), "nextCursor" to null)
        val collection = if (kind == "CARDS") "nfcCards" else "sparkStudents"
        val docs = ids.chunked(5).flatMap { chunk ->
            var query = root.collection(collection).whereIn("sectionId", chunk).orderBy(FieldPath.documentId()).limit(size.toLong() + 1)
            if (cursor != null) query = query.startAfter(cursor)
            query.get(Source.SERVER).await().documents
        }.sortedBy { it.id }
        val page = docs.take(size)
        val items = page.map { doc ->
            val item = doc.data.orEmpty()
            if (kind == "GUARDIANS") mapOf("id" to "${doc.id}_parent", "studentId" to doc.id, "guardianId" to "${doc.id}_parent",
                "phoneE164" to item["parentPhone"], "phoneStatus" to if (item["parentPhoneVerified"] == true) "VERIFIED" else "UNVERIFIED",
                "consentStatus" to if (item["parentConsent"] == true) "RECORDED" else "PENDING", "guardianStatus" to item["status"],
                "receiveArrivalSms" to true, "receiveDismissalSms" to true, "receiveLateSms" to true, "receiveCustomSms" to false)
            else (item - setOf("parentPhone", "parentName")) + ("id" to doc.id)
        }
        return mapOf("items" to items, "nextCursor" to if (docs.size > size) page.last().id else null)
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun attendance(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        authorized(schoolId)
        val root = school(schoolId)
        val events = data["events"] as? List<Map<String, Any?>> ?: error("Events are required.")
        val results = events.map { event ->
            val key = text(event, "idempotencyKey"); val studentId = text(event, "studentId")
            val eventId = text(event, "eventUuid")
            val type = text(event, "eventType"); val date = text(event, "localSchoolDate")
            require(key == "$schoolId|$studentId|$date|${event["subjectId"]}|ROLLCALL|$eventId" || key == "$schoolId|$studentId|$date|$type" || (event["source"] == "MANUAL" && type in setOf("ARRIVAL", "ABSENT") && key == "$schoolId|$studentId|$date|ROLLCALL|$eventId")) { "Attendance key is invalid." }
            require(Instant.parse(text(event, "localTimestamp")).atZone(ZoneId.of(text(event, "timezone"))).toLocalDate().toString() == date)
            val ref = root.collection("sparkAttendance").document(key)
            val outcome = try { db.runTransaction { tx ->
                val old = tx.get(ref)
                if (old.exists()) {
                    if (old.getString("eventUuid") == eventId) "ALREADY_EXISTS" else "REJECTED"
                } else {
                    val student = tx.get(root.collection("sparkStudents").document(studentId))
                    require(student.getString("status") == "ACTIVE") { "Student is not active." }
                    tx.set(ref, mapOf("eventUuid" to eventId, "studentId" to studentId, "sectionId" to student.getString("sectionId"),
                        "teacherId" to uid, "deviceId" to preferences.deviceId, "source" to text(event, "source"), "cardId" to event["cardId"],
                        "subjectId" to (event["subjectId"] ?: ""), "attendanceTag" to (event["attendanceTag"] ?: ""), "eventType" to type, "localSchoolDate" to date, "localTimestamp" to text(event, "localTimestamp"),
                        "timezone" to text(event, "timezone"), "smsExpectedCount" to event["smsExpectedCount"], "receivedAt" to FieldValue.serverTimestamp()))
                    "ACCEPTED"
                }
            }.await() } catch (error: com.google.firebase.firestore.FirebaseFirestoreException) {
                if (error.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.PERMISSION_DENIED) "REJECTED" else throw error
            } catch (_: IllegalArgumentException) { "REJECTED" }
            mapOf("localEventUuid" to eventId, "eventId" to key, "result" to outcome, "errorMessage" to if (outcome == "REJECTED") "Attendance is no longer authorized or another device recorded it." else null)
        }
        return mapOf("results" to results)
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun sms(schoolId: String, data: Map<String, Any?>): Map<String, Any?> {
        authorized(schoolId)
        val root = school(schoolId)
        val messages = data["results"] as? List<Map<String, Any?>> ?: error("SMS results are required.")
        val results = messages.map { message ->
            val messageId = text(message, "messageId"); val eventId = text(message, "attendanceEventId")
            // Query only this teacher; a guardian number is never uploaded in an SMS result.
            val events = root.collection("sparkAttendance").whereEqualTo("teacherId", uid).whereEqualTo("eventUuid", eventId).limit(1).get(Source.SERVER).await()
            val event = events.documents.firstOrNull() ?: return@map mapOf("messageId" to messageId, "result" to "REJECTED", "errorMessage" to "Matching attendance was rejected or belongs to another device.")
            val ref = root.collection("sparkSms").document(messageId)
            val values = mapOf("attendanceKey" to event.id, "attendanceEventId" to eventId, "studentId" to event.getString("studentId"),
                "sectionId" to event.getString("sectionId"), "guardianId" to text(message, "guardianId"), "teacherId" to uid,
                "deviceId" to preferences.deviceId, "status" to text(message, "status").let { if (it in setOf("PENDING", "READY")) "QUEUED" else it }, "attemptCount" to message["attemptCount"],
                "sentAt" to message["sentAt"], "deliveredAt" to message["deliveredAt"], "lastErrorCode" to message["lastErrorCode"], "updatedAt" to FieldValue.serverTimestamp())
            db.runTransaction { tx ->
                val old = tx.get(ref)
                if ((old.getLong("attemptCount") ?: 0) > ((message["attemptCount"] as? Number)?.toLong() ?: 0)) return@runTransaction
                tx.set(ref, values)
            }.await()
            mapOf("messageId" to messageId, "result" to "ACCEPTED")
        }
        return mapOf("results" to results)
    }

    private fun normalizePhone(input: String): String {
        val compact = input.replace(Regex("[\\s()-]"), "")
        val phone = when {
            compact.startsWith("09") -> "+63" + compact.drop(1)
            compact.startsWith("639") -> "+$compact"
            compact.startsWith("9") -> "+63$compact"
            else -> compact
        }
        require(Regex("^\\+639\\d{9}$").matches(phone)) { "Enter a valid Philippine mobile number." }
        return phone
    }
}
