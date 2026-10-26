// Strautomator: AWS SNS message validation

import axios from "axios"
import crypto from "crypto"

// Signing certificates cached by URL (only a few are used by SNS at any time).
const certificates = new Map<string, string>()
const maxCertificates = 20

// Fields included in the string to sign, per message type (in this exact order).
const notificationFields = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
const subscriptionFields = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]

/**
 * Check if the URL is a valid SNS HTTPS URL.
 * @param value The URL to be checked.
 */
export const isSnsUrl = (value: string): boolean => {
    try {
        const url = new URL(value)
        return url.protocol == "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(url.hostname)
    } catch {
        return false
    }
}

/**
 * Verify the signature of a message sent by AWS SNS. Returns false if the message
 * is not correctly signed by an SNS certificate.
 * @param message The parsed SNS message.
 */
export const verifySnsMessage = async (message: any): Promise<boolean> => {
    if (!message?.Signature || !message.SigningCertURL || !message.Type) {
        return false
    }
    if (!["1", "2"].includes(message.SignatureVersion)) {
        return false
    }

    if (!isSnsUrl(message.SigningCertURL)) {
        return false
    }
    const parsedCertUrl = new URL(message.SigningCertURL)
    if (parsedCertUrl.search || parsedCertUrl.hash || !parsedCertUrl.pathname.endsWith(".pem")) {
        return false
    }
    const certUrl = `${parsedCertUrl.origin}${parsedCertUrl.pathname}`

    let fields: string[]
    if (message.Type == "Notification") {
        fields = notificationFields
    } else if (message.Type == "SubscriptionConfirmation" || message.Type == "UnsubscribeConfirmation") {
        fields = subscriptionFields
    } else {
        return false
    }

    const stringToSign = fields
        .filter((f) => typeof message[f] == "string")
        .map((f) => `${f}\n${message[f]}\n`)
        .join("")

    let certificate = certificates.get(certUrl)
    if (!certificate) {
        const res = await axios.get(certUrl, {responseType: "text", timeout: 5000, maxContentLength: 65536, maxRedirects: 0})
        certificate = res.data
        if (certificates.size >= maxCertificates) {
            certificates.delete(certificates.keys().next().value)
        }
        certificates.set(certUrl, certificate)
    }

    const algorithm = message.SignatureVersion == "1" ? "RSA-SHA1" : "RSA-SHA256"
    const verifier = crypto.createVerify(algorithm)
    verifier.update(stringToSign, "utf8")
    return verifier.verify(certificate, message.Signature, "base64")
}
