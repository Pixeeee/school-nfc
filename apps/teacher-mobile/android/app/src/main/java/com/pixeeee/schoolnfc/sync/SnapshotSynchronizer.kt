
package com.pixeeee.schoolnfc.sync

import androidx.room.withTransaction
import com.pixeeee.schoolnfc.cloud.CloudGateway
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.database.CardEntity
import com.pixeeee.schoolnfc.database.GuardianRouteEntity
import com.pixeeee.schoolnfc.database.SmsTemplateEntity
import com.pixeeee.schoolnfc.database.StudentEntity
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.security.CryptoManager

class SnapshotSynchronizer(
    private val database: AppDatabase,
    private val cloud: CloudGateway,
    private val preferences: DevicePreferences,
    private val crypto: CryptoManager,
) {
    suspend fun refreshAll() {
        refreshConfig()
        refreshKind("STUDENTS") { items -> database.students().upsert(items.mapNotNull(::student)) }
        refreshKind("CARDS") { items -> database.cards().upsert(items.mapNotNull(::card)) }
        refreshKind("GUARDIANS") { items -> database.guardianRoutes().upsert(items.mapNotNull(::guardianRoute)) }
        refreshKind("TEMPLATES") { items -> database.smsTemplates().upsert(items.mapNotNull(::template)) }
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun refreshConfig() {
        val result = cloud.getSnapshot("CONFIG")
        val first = (result["items"] as? List<Map<String, Any?>>)?.firstOrNull() ?: return
        val school = first["school"] as? Map<String, Any?> ?: return
        preferences.schoolName = school["name"]?.toString()
        preferences.schoolPublicCode = school["publicCode"]?.toString()
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun refreshKind(kind: String, consume: suspend (List<Map<String, Any?>>) -> Unit) {
        var cursor: String? = null
        var pages = 0
        do {
            val result = cloud.getSnapshot(kind, cursor)
            val items = result["items"] as? List<Map<String, Any?>> ?: emptyList()
            consume(items)
            cursor = result["nextCursor"]?.toString()?.takeIf { it != "null" }
            pages += 1
        } while (cursor != null && pages < 100)
    }

    private fun student(m: Map<String, Any?>): StudentEntity? = runCatching { StudentEntity(
        id = m["id"].toString(), studentNumber = m["studentNumber"].toString(), displayName = m["displayName"].toString(),
        sectionId = m["sectionId"].toString(), status = m["status"].toString(), photoPath = m["photoPath"]?.toString(), activeCardId = m["activeCardId"]?.toString(),
    ) }.getOrNull()

    private fun card(m: Map<String, Any?>): CardEntity? = runCatching { CardEntity(
        id = m["id"].toString(), studentId = m["studentId"].toString(), tokenHash = m["tokenHash"].toString(),
        tagUidHash = m["tagUidHash"]?.toString(), payloadVersion = m["payloadVersion"]?.toString() ?: "EDU1", status = m["status"].toString(),
    ) }.getOrNull()

    private fun guardianRoute(m: Map<String, Any?>): GuardianRouteEntity? = runCatching {
        val phone = m["phoneE164"]?.toString() ?: return null
        GuardianRouteEntity(
            id = m["id"].toString(), studentId = m["studentId"].toString(), guardianId = m["guardianId"].toString(), encryptedPhone = crypto.encrypt(phone),
            phoneStatus = m["phoneStatus"]?.toString() ?: "UNVERIFIED", consentStatus = m["consentStatus"]?.toString() ?: "PENDING",
            guardianStatus = m["guardianStatus"]?.toString() ?: "INACTIVE", receiveArrivalSms = m["receiveArrivalSms"] as? Boolean ?: false,
            receiveDismissalSms = m["receiveDismissalSms"] as? Boolean ?: false, receiveLateSms = m["receiveLateSms"] as? Boolean ?: false,
            receiveCustomSms = m["receiveCustomSms"] as? Boolean ?: false,
        )
    }.getOrNull()

    private fun template(m: Map<String, Any?>): SmsTemplateEntity? = runCatching { SmsTemplateEntity(
        id = m["id"].toString(), eventType = m["eventType"].toString(), name = m["name"].toString(), body = m["body"].toString(), enabled = m["enabled"] as? Boolean ?: false,
    ) }.getOrNull()
}
