package com.pixeeee.schoolnfc

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.google.firebase.auth.FirebaseAuth
import com.pixeeee.schoolnfc.database.AppDatabase
import com.pixeeee.schoolnfc.database.SmsOutboxEntity
import com.pixeeee.schoolnfc.device.DevicePreferences
import com.pixeeee.schoolnfc.security.CryptoManager
import com.pixeeee.schoolnfc.sms.SmsQueueWorker
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class SmsQueueSafetyTest {
    // Run only with the Auth emulator. An invalid subscription prevents every modem send.
    @Test fun unavailableSimPausesWithoutLosingMessagesOrBlockingReplacementWork() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val auth = FirebaseAuth.getInstance()
        check(auth.currentUser == null) { "Run this test on the isolated signed-out emulator." }
        auth.useEmulator("10.0.2.2", 9099)
        val prefs = DevicePreferences(context)
        val oldSchool = prefs.schoolId; val oldSim = prefs.selectedSubscriptionId
        val db = AppDatabase.get(context)
        val work = WorkManager.getInstance(context)
        val messageId = "sim-safety-${UUID.randomUUID()}"
        try {
            auth.signInAnonymously().await()
            val uid = requireNotNull(auth.currentUser?.uid)
            prefs.schoolId = "sim_test_school"; prefs.authorizationUserId = uid; prefs.authorizationBackend = prefs.backend
            prefs.leaseId = "sim_test_lease"; prefs.leaseExpiresAt = Instant.now().plusSeconds(3600).toString()
            val now = System.currentTimeMillis()
            db.smsOutbox().insert(SmsOutboxEntity(messageId = messageId, idempotencyKey = "TEST|$messageId", attendanceEventUuid = messageId,
                guardianId = "TEST", ownerUid = uid, encryptedPhone = CryptoManager().encrypt("+639171234567"), renderedMessage = "Emulator fixture. Must never send.",
                subscriptionId = Int.MAX_VALUE, cloudDirty = false, createdAtEpochMs = now, updatedAtEpochMs = now))
            for (sim in listOf(Int.MAX_VALUE, null)) {
                prefs.selectedSubscriptionId = sim
                val request = OneTimeWorkRequestBuilder<SmsQueueWorker>().build()
                work.enqueue(request)
                val state = withTimeout(5000) { work.getWorkInfoByIdFlow(request.id).filterNotNull().first { it.state.isFinished }.state }
                assertEquals("Setup must pause instead of backing off replacement work", WorkInfo.State.SUCCEEDED, state)
                val saved = requireNotNull(db.smsOutbox().byMessageId(messageId))
                assertEquals("PENDING", saved.status)
                assertEquals(0, saved.attemptCount)
            }
        } finally {
            db.openHelper.writableDatabase.execSQL("DELETE FROM sms_outbox WHERE messageId = ?", arrayOf(messageId))
            prefs.clearAuthorization(); prefs.schoolId = oldSchool; prefs.selectedSubscriptionId = oldSim
            auth.signOut()
        }
    }
}
