
package com.pixeeee.schoolnfc.nfc

data class CardPayload(val version: String, val schoolPublicCode: String, val token: String)

object CardPayloadCodec {
    private val schoolCode = Regex("^[A-Z0-9]{6,12}$")
    private val token = Regex("^[A-Za-z0-9_-]{22,64}$")
    fun parse(raw: String): CardPayload {
        require(raw.length <= 128) { "NFC payload is too large." }
        val parts = raw.split('|')
        require(parts.size == 3 && parts[0] == "EDU1" && schoolCode.matches(parts[1]) && token.matches(parts[2])) { "Unsupported NFC card." }
        return CardPayload(parts[0], parts[1], parts[2])
    }
}
