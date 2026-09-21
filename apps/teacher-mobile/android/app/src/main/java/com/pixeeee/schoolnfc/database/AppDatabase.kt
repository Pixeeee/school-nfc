
package com.pixeeee.schoolnfc.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [StudentEntity::class, CardEntity::class, GuardianRouteEntity::class, SmsTemplateEntity::class,
        ScannerSessionEntity::class, AttendanceEventEntity::class, SmsOutboxEntity::class, SyncOutboxEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun students(): StudentDao
    abstract fun cards(): CardDao
    abstract fun guardianRoutes(): GuardianRouteDao
    abstract fun smsTemplates(): SmsTemplateDao
    abstract fun scannerSessions(): ScannerSessionDao
    abstract fun attendance(): AttendanceDao
    abstract fun smsOutbox(): SmsOutboxDao
    abstract fun syncOutbox(): SyncOutboxDao

    companion object {
        @Volatile private var instance: AppDatabase? = null
        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "school-nfc.db")
                .build().also { instance = it }
        }
    }
}
