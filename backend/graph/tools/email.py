"""Email tool: send outbound emails via SMTP."""

from langchain_core.tools import tool

from app.services.smtp import send_smtp_email


@tool
async def send_email(to: str, subject: str, body: str) -> str:
    """Send an email to a recipient.

    Use this to communicate with contacts, send follow-ups, or
    deliver reports. Requires SMTP to be configured in Settings.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Plain-text email body.
    """
    return await send_smtp_email(to, subject, body)
