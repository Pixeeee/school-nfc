
package com.pixeeee.schoolnfc.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [SectionEntity::class, StudentEntity::class, CardEntity::class, GuardianRouteEntity::class, SmsTemplateEntity::class,
        ScannerSessionEntity::class, AttendanceEventEntity::class, SmsOutboxEntity::class, SyncOutboxEntity::class],
    version = 2,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun sections(): SectionDao
    abstract fun students(): StudentDao
    abstract fun cards(): CardDao
    abstract fun guardianRoutes(): GuardianRouteDao
    abstract fun smsTemplates(): SmsTemplateDao
    abstract fun scannerSessions(): ScannerSessionDao
    abstract fun attendance(): AttendanceDao
    abstract fun smsOutbox(): SmsOutboxDao
    abstract fun syncOutbox(): SyncOutboxDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `sections` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, PRIMARY KEY(`id`))")
                db.execSQL("ALTER TABLE `attendance_events` ADD COLUMN `source` TEXT NOT NULL DEFAULT 'NFC'")
            }
        }
        @Volatile private var instance: AppDatabase? = null
        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "school-nfc.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }
    }
}
