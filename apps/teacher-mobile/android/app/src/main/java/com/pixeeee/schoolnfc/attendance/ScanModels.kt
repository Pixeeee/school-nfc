
package com.pixeeee.schoolnfc.attendance

data class ActiveScannerSession(
    val id: String,
    val schoolId: String,
    val mode: String,
    val sectionId: String?,
    val customLabel: String?,
)

data class ScanOutcome(
    val status: String,
    val localTimestamp: String,
    val eventUuid: String? = null,
    val studentId: String? = null,
    val displayName: String? = null,
    val studentNumber: String? = null,
    val eventType: String? = null,
    val reason: String? = null,
    val smsQueued: Int = 0,
    val photoPath: String? = null,
)
