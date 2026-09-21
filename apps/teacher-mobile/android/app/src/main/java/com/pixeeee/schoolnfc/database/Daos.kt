
package com.pixeeee.schoolnfc.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface StudentDao {
    @Query("SELECT * FROM students WHERE id = :id LIMIT 1") suspend fun byId(id: String): StudentEntity?
    @Query("SELECT * FROM students WHERE status = 'ACTIVE' AND (displayName LIKE '%' || :query || '%' OR studentNumber LIKE '%' || :query || '%') ORDER BY displayName LIMIT :limit")
    suspend fun search(query: String, limit: Int): List<StudentEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(items: List<StudentEntity>)
    @Query("DELETE FROM students") suspend fun clear()
}

@Dao
interface CardDao {
    @Query("SELECT * FROM cards WHERE tokenHash = :tokenHash LIMIT 1") suspend fun byTokenHash(tokenHash: String): CardEntity?
    @Query("SELECT * FROM cards WHERE id = :id LIMIT 1") suspend fun byId(id: String): CardEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(items: List<CardEntity>)
    @Query("DELETE FROM cards") suspend fun clear()
}

@Dao
interface GuardianRouteDao {
    @Query("SELECT * FROM guardian_routes WHERE studentId = :studentId AND guardianStatus = 'ACTIVE' AND phoneStatus = 'VERIFIED' AND consentStatus IN ('RECORDED', 'NOT_REQUIRED')")
    suspend fun activeForStudent(studentId: String): List<GuardianRouteEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(items: List<GuardianRouteEntity>)
    @Query("DELETE FROM guardian_routes") suspend fun clear()
}

@Dao
interface SmsTemplateDao {
    @Query("SELECT * FROM sms_templates WHERE eventType = :eventType AND enabled = 1 LIMIT 1") suspend fun byEventType(eventType: String): SmsTemplateEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(items: List<SmsTemplateEntity>)
    @Query("DELETE FROM sms_templates") suspend fun clear()
}

@Dao
interface ScannerSessionDao {
    @Insert(onConflict = OnConflictStrategy.ABORT) suspend fun insert(entity: ScannerSessionEntity)
    @Query("UPDATE scanner_sessions SET stoppedAtEpochMs = :stoppedAt WHERE id = :id") suspend fun stop(id: String, stoppedAt: Long)
}

@Dao
interface AttendanceDao {
    @Query("SELECT * FROM attendance_events WHERE idempotencyKey = :key LIMIT 1") suspend fun byIdempotencyKey(key: String): AttendanceEventEntity?
    @Query("SELECT * FROM attendance_events WHERE eventUuid = :uuid LIMIT 1") suspend fun byUuid(uuid: String): AttendanceEventEntity?
    @Insert(onConflict = OnConflictStrategy.ABORT) suspend fun insert(entity: AttendanceEventEntity): Long
    @Query("SELECT * FROM attendance_events WHERE syncStatus IN ('PENDING','RETRY') ORDER BY createdAtEpochMs LIMIT :limit") suspend fun pending(limit: Int): List<AttendanceEventEntity>
    @Query("UPDATE attendance_events SET syncStatus = :status, serverEventId = :serverEventId, conflictReason = :reason WHERE eventUuid = :uuid")
    suspend fun updateSync(uuid: String, status: String, serverEventId: String?, reason: String?)
    @Query("SELECT COUNT(*) FROM attendance_events WHERE syncStatus IN ('PENDING','RETRY')") suspend fun pendingCount(): Int
}

@Dao
interface SmsOutboxDao {
    @Insert(onConflict = OnConflictStrategy.ABORT) suspend fun insert(entity: SmsOutboxEntity): Long
    @Query("SELECT * FROM sms_outbox WHERE status IN ('PENDING','READY','FAILED_RETRYABLE') AND nextAttemptAtEpochMs <= :now ORDER BY createdAtEpochMs LIMIT 1") suspend fun nextReady(now: Long): SmsOutboxEntity?
    @Query("UPDATE sms_outbox SET status = 'SENDING', attemptCount = attemptCount + 1, partCount = :partCount, sentPartCount = 0, deliveredPartCount = 0, subscriptionId = :subscriptionId, updatedAtEpochMs = :now WHERE messageId = :messageId AND status IN ('PENDING','READY','FAILED_RETRYABLE')")
    suspend fun claim(messageId: String, partCount: Int, subscriptionId: Int, now: Long): Int
    @Query("SELECT * FROM sms_outbox WHERE messageId = :messageId LIMIT 1") suspend fun byMessageId(messageId: String): SmsOutboxEntity?
    @Query("UPDATE sms_outbox SET sentPartCount = sentPartCount + 1, status = CASE WHEN sentPartCount + 1 >= partCount THEN 'SENT' ELSE status END, sentAtIso = CASE WHEN sentPartCount + 1 >= partCount THEN :atIso ELSE sentAtIso END, cloudDirty = 1, updatedAtEpochMs = :now WHERE messageId = :messageId")
    suspend fun markPartSent(messageId: String, atIso: String, now: Long)
    @Query("UPDATE sms_outbox SET deliveredPartCount = deliveredPartCount + 1, status = CASE WHEN deliveredPartCount + 1 >= partCount THEN 'DELIVERED' ELSE status END, deliveredAtIso = CASE WHEN deliveredPartCount + 1 >= partCount THEN :atIso ELSE deliveredAtIso END, cloudDirty = 1, updatedAtEpochMs = :now WHERE messageId = :messageId")
    suspend fun markPartDelivered(messageId: String, atIso: String, now: Long)
    @Query("UPDATE sms_outbox SET status = :status, lastErrorCode = :code, lastErrorMessage = :message, nextAttemptAtEpochMs = :nextAttempt, cloudDirty = 1, updatedAtEpochMs = :now WHERE messageId = :messageId")
    suspend fun markFailure(messageId: String, status: String, code: String, message: String, nextAttempt: Long, now: Long)
    @Query("SELECT * FROM sms_outbox WHERE cloudDirty = 1 ORDER BY updatedAtEpochMs LIMIT :limit") suspend fun dirty(limit: Int): List<SmsOutboxEntity>
    @Query("UPDATE sms_outbox SET cloudDirty = 0 WHERE messageId IN (:messageIds)") suspend fun markClean(messageIds: List<String>)
    @Query("UPDATE sms_outbox SET status = 'READY', nextAttemptAtEpochMs = 0, updatedAtEpochMs = :now WHERE status = 'FAILED_RETRYABLE'") suspend fun retryAll(now: Long): Int
    @Query("SELECT COUNT(*) FROM sms_outbox WHERE status IN ('PENDING','READY','SENDING')") suspend fun pendingCount(): Int
    @Query("SELECT COUNT(*) FROM sms_outbox WHERE status = 'FAILED_RETRYABLE'") suspend fun retryCount(): Int
    @Query("SELECT COUNT(*) FROM sms_outbox WHERE status = 'FAILED_FINAL'") suspend fun failedCount(): Int
    @Query("UPDATE sms_outbox SET status = 'FAILED_RETRYABLE', lastErrorCode = 'PROCESS_INTERRUPTED', nextAttemptAtEpochMs = :now, cloudDirty = 1, updatedAtEpochMs = :now WHERE status = 'SENDING' AND updatedAtEpochMs < :staleBefore")
    suspend fun recoverStaleSending(now: Long, staleBefore: Long): Int
}

@Dao
interface SyncOutboxDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(entity: SyncOutboxEntity): Long
    @Query("SELECT COUNT(*) FROM sync_outbox WHERE status IN ('PENDING','RETRY')") suspend fun pendingCount(): Int
    @Query("UPDATE sync_outbox SET status = 'DONE', updatedAtEpochMs = :now WHERE aggregateType = :type AND aggregateId IN (:ids)") suspend fun markDone(type: String, ids: List<String>, now: Long)
    @Query("UPDATE sync_outbox SET status = 'RETRY', attemptCount = attemptCount + 1, nextAttemptAtEpochMs = :next, lastError = :error, updatedAtEpochMs = :now WHERE aggregateType = :type AND aggregateId IN (:ids)")
    suspend fun markRetry(type: String, ids: List<String>, next: Long, error: String, now: Long)
}
