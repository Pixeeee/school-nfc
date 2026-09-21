
package com.pixeeee.schoolnfc.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "students", indices = [Index("studentNumber"), Index("sectionId"), Index("displayName")])
data class StudentEntity(
    @PrimaryKey val id: String,
    val studentNumber: String,
    val displayName: String,
    val sectionId: String,
    val status: String,
    val photoPath: String? = null,
    val activeCardId: String? = null,
    val updatedAtEpochMs: Long = 0,
)

@Entity(tableName = "cards", indices = [Index(value = ["tokenHash"], unique = true), Index("studentId"), Index("status")])
data class CardEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val tokenHash: String,
    val tagUidHash: String? = null,
    val payloadVersion: String,
    val status: String,
    val updatedAtEpochMs: Long = 0,
)

@Entity(tableName = "guardian_routes", indices = [Index("studentId"), Index("guardianId")])
data class GuardianRouteEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val guardianId: String,
    val encryptedPhone: String,
    val phoneStatus: String,
    val consentStatus: String,
    val guardianStatus: String,
    val receiveArrivalSms: Boolean,
    val receiveDismissalSms: Boolean,
    val receiveLateSms: Boolean,
    val receiveCustomSms: Boolean,
    val updatedAtEpochMs: Long = 0,
)

@Entity(tableName = "sms_templates", indices = [Index(value = ["eventType"], unique = true)])
data class SmsTemplateEntity(
    @PrimaryKey val id: String,
    val eventType: String,
    val name: String,
    val body: String,
    val enabled: Boolean,
    val updatedAtEpochMs: Long = 0,
)

@Entity(tableName = "scanner_sessions")
data class ScannerSessionEntity(
    @PrimaryKey val id: String,
    val schoolId: String,
    val mode: String,
    val sectionId: String? = null,
    val customLabel: String? = null,
    val teacherId: String,
    val startedAtEpochMs: Long,
    val stoppedAtEpochMs: Long? = null,
)

@Entity(
    tableName = "attendance_events",
    indices = [
        Index(value = ["eventUuid"], unique = true),
        Index(value = ["idempotencyKey"], unique = true),
        Index("syncStatus"),
        Index("studentId"),
        Index("localSchoolDate"),
    ],
)
data class AttendanceEventEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val eventUuid: String,
    val idempotencyKey: String,
    val schoolId: String,
    val studentId: String,
    val cardId: String,
    val eventType: String,
    val status: String,
    val localSchoolDate: String,
    val localTimestamp: String,
    val elapsedRealtimeMs: Long,
    val timezone: String,
    val clockTrust: String,
    val deviceId: String,
    val teacherId: String,
    val scannerSessionId: String,
    val smsExpectedCount: Int,
    val syncStatus: String = "PENDING",
    val serverEventId: String? = null,
    val conflictReason: String? = null,
    val createdAtEpochMs: Long,
)

@Entity(
    tableName = "sms_outbox",
    indices = [
        Index(value = ["messageId"], unique = true),
        Index(value = ["idempotencyKey"], unique = true),
        Index("status"),
        Index("attendanceEventUuid"),
    ],
)
data class SmsOutboxEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val messageId: String,
    val idempotencyKey: String,
    val attendanceEventUuid: String,
    val guardianId: String,
    val encryptedPhone: String,
    val renderedMessage: String,
    val subscriptionId: Int?,
    val status: String = "PENDING",
    val attemptCount: Int = 0,
    val nextAttemptAtEpochMs: Long = 0,
    val partCount: Int = 1,
    val sentPartCount: Int = 0,
    val deliveredPartCount: Int = 0,
    val sentAtIso: String? = null,
    val deliveredAtIso: String? = null,
    val lastErrorCode: String? = null,
    val lastErrorMessage: String? = null,
    val cloudDirty: Boolean = true,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long,
)

@Entity(tableName = "sync_outbox", indices = [Index("status"), Index("aggregateType"), Index("createdAtEpochMs")])
data class SyncOutboxEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val aggregateType: String,
    val aggregateId: String,
    val status: String = "PENDING",
    val attemptCount: Int = 0,
    val nextAttemptAtEpochMs: Long = 0,
    val lastError: String? = null,
    val createdAtEpochMs: Long,
    val updatedAtEpochMs: Long,
)
