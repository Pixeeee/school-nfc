
package com.pixeeee.schoolnfc

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SchoolNfcPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
