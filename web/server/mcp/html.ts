// Strautomator MCP HTML pages (consent / errors)

import {escapeHtml, getMcpConfig} from "./utils"

/**
 * Shared HTML layout for OAuth consent and error pages.
 */
const layout = (title: string, body: string): string => {
    const config = getMcpConfig()
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - Strautomator</title>
    <style>
        body { margin: 0; font-family: "Roboto", "Helvetica Neue", Arial, sans-serif; background: #0b0b0d; color: #fff; }
        .wrap { max-width: 560px; margin: 0 auto; padding: 64px 20px 40px; }
        .brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0 0 36px; font-size: 20px; font-weight: 500; }
        h2 { margin: 0 0 24px; font-size: 2.02rem; font-weight: 800; line-height: 1.1; text-align: center; }
        p { line-height: 1.6; color: rgba(255, 255, 255, 0.75); }
        .card { background: rgba(255, 255, 255, 0.055); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 26px; }
        .card p:first-child { margin-top: 0; }
        .actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }
        button, .btn { appearance: none; border: 1px solid transparent; border-radius: 24px; padding: 10px 20px; font: inherit; font-size: 14px; cursor: pointer; text-decoration: none; display: inline-block; }
        .primary { background: #ffa000; color: #111; font-weight: 600; }
        .ghost { background: transparent; color: #ffa000; border-color: #ffa000; }
        button:disabled { opacity: 0.6; cursor: default; }
        .muted { margin-top: 28px; color: rgba(255, 255, 255, 0.55); font-size: 13px; text-align: center; overflow-wrap: anywhere; }
        a { color: #ffa000; }
        @media (max-width: 600px) { .wrap { padding-top: 40px; } h2 { font-size: 1.8rem; } .card { padding: 20px; } }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="brand"><img src="/images/logo.svg" alt="" width="22" height="33" />Strautomator</div>
        ${body}
        <div class="muted">${escapeHtml(config.resource)}</div>
    </div>
</body>
</html>`
}

/**
 * OAuth consent page shown to logged-in PRO users before issuing an authorization code.
 */
export const consentPage = (options: {clientName: string; userName: string; redirectTarget: string; requestId: string; consentToken: string; preview?: boolean}): string => {
    const clientName = escapeHtml(options.clientName || "An MCP client")
    const userName = escapeHtml(options.userName || "your account")
    const redirectTarget = escapeHtml(options.redirectTarget)

    return layout(
        "Authorize MCP access",
        `
        <h2>Authorize MCP access</h2>
        <div class="card">
            <p><strong>${clientName}</strong> wants to access Strautomator as <strong>${userName}</strong>.</p>
            <p>This lets the client see which automations ran on an activity, read your automations, bikes and shoes, and make changes to some of your Strautomator data.</p>
            <p>After authorizing, you'll be sent back to <strong>${redirectTarget}</strong>. Only continue if you recognize it and if you started this request yourself.</p>
            <form method="post" action="/mcp/oauth/authorize">
                <input type="hidden" name="request_id" value="${escapeHtml(options.requestId)}" />
                <input type="hidden" name="consent_token" value="${escapeHtml(options.consentToken)}" />
                <div class="actions">
                    <button class="ghost" title="Deny access" type="submit" name="decision" value="deny"${options.preview ? " disabled" : ""}>Deny</button>
                    <button class="primary" title="Authorize access" type="submit" name="decision" value="approve"${options.preview ? " disabled" : ""}>Authorize</button>
                </div>
            </form>
        </div>
        `
    )
}

/**
 * Generic error page for the OAuth consent flow.
 */
export const errorPage = (title: string, message: string, href?: string, hrefLabel?: string): string => {
    const link = href ? `<p><a class="btn primary" href="${escapeHtml(href)}">${escapeHtml(hrefLabel || "Continue")}</a></p>` : ""
    return layout(title, `<h2>${escapeHtml(title)}</h2><div class="card"><p>${escapeHtml(message)}</p>${link}</div>`)
}

/**
 * Shown when a non-PRO user completes Strava login but cannot authorize MCP access.
 */
export const proRequiredPage = (): string => {
    return errorPage("PRO required", "The Strautomator MCP server is available to PRO members only. Upgrade your account, then try connecting again.", "/billing", "Go to billing")
}
