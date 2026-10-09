package com.pixeeee.schoolnfc.cloud

import com.getcapacitor.JSObject
import org.json.JSONObject

fun bridgeResponse(data: Map<String, Any?>): JSObject = JSObject.fromJSONObject(JSONObject(data))
