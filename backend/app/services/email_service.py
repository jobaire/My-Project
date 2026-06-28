import logging
import smtplib
from concurrent.futures import ThreadPoolExecutor
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

_pool = ThreadPoolExecutor(max_workers=3)

from app.core.config import (
    APP_NAME,
    APP_URL,
    EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USER,
)

logger = logging.getLogger(__name__)


def _send(to_address: str, subject: str, html_body: str, text_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDRESS}>"
    msg["To"] = to_address
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(EMAIL_FROM_ADDRESS, [to_address], msg.as_string())

    logger.info("Email sent to %s | subject: %s", to_address, subject)


def send_password_reset(to_address: str, token: str) -> None:
    link = f"{APP_URL}/set-password?token={token}&purpose=reset"
    subject = f"Reset your {APP_NAME} password"
    html_body = f"""
<div style="font-family:'Manrope',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px">
  <h2 style="color:#0d1b2a;margin:0 0 8px">Password Reset</h2>
  <p style="color:#555;margin:0 0 24px">You requested a password reset for your <strong>{APP_NAME}</strong> account.</p>
  <a href="{link}" style="display:inline-block;background:#d96f22;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
    Reset Password
  </a>
  <p style="color:#888;font-size:13px;margin:24px 0 0">This link expires in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>
  <p style="color:#ccc;font-size:11px;margin:8px 0 0;word-break:break-all">Or copy: {link}</p>
</div>
"""
    text_body = (
        f"Reset your {APP_NAME} password\n\n"
        f"Click the link below to reset your password:\n{link}\n\n"
        f"This link expires in 1 hour.\n"
        f"If you did not request this, ignore this email."
    )
    _send(to_address, subject, html_body, text_body)


def send_invite(to_address: str, token: str, invited_by_name: str) -> None:
    link = f"{APP_URL}/set-password?token={token}&purpose=invite"
    subject = f"You've been invited to {APP_NAME}"
    html_body = f"""
<div style="font-family:'Manrope',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px">
  <h2 style="color:#0d1b2a;margin:0 0 8px">You're Invited!</h2>
  <p style="color:#555;margin:0 0 8px"><strong>{invited_by_name}</strong> has invited you to join <strong>{APP_NAME}</strong>.</p>
  <p style="color:#555;margin:0 0 24px">Click the button below to set your password and activate your account.</p>
  <a href="{link}" style="display:inline-block;background:#d96f22;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
    Activate Account
  </a>
  <p style="color:#888;font-size:13px;margin:24px 0 0">This invitation expires in <strong>48 hours</strong>.</p>
  <p style="color:#ccc;font-size:11px;margin:8px 0 0;word-break:break-all">Or copy: {link}</p>
</div>
"""
    text_body = (
        f"You've been invited to {APP_NAME} by {invited_by_name}.\n\n"
        f"Activate your account by clicking the link below:\n{link}\n\n"
        f"This invitation expires in 48 hours."
    )
    _send(to_address, subject, html_body, text_body)


# ── Async (fire-and-forget) wrappers ──────────────────────────────────────────

def _fire(fn, *args):
    try:
        fn(*args)
    except Exception:
        logger.exception("Background email failed: %s args=%s", fn.__name__, args[:1])


def send_password_reset_async(to_address: str, token: str) -> None:
    _pool.submit(_fire, send_password_reset, to_address, token)


def send_invite_async(to_address: str, token: str, invited_by_name: str) -> None:
    _pool.submit(_fire, send_invite, to_address, token, invited_by_name)


def send_welcome(to_address: str, name: str, tenant_name: str, trial_ends_at) -> None:
    from datetime import timezone
    trial_date = trial_ends_at.astimezone(timezone.utc).strftime("%B %d, %Y")
    subject = f"Welcome to {APP_NAME} — your trial has started"
    html_body = f"""
<div style="font-family:'Manrope',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px">
  <h2 style="color:#0d1b2a;margin:0 0 8px">Welcome to {APP_NAME}, {name}!</h2>
  <p style="color:#555;margin:0 0 8px">Your company <strong>{tenant_name}</strong> is ready. Your 14-day free trial runs until <strong>{trial_date}</strong>.</p>
  <a href="{APP_URL}" style="display:inline-block;background:#d96f22;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0">
    Go to {APP_NAME}
  </a>
  <p style="color:#888;font-size:13px;margin:16px 0 0">Questions? Reply to this email.</p>
</div>
"""
    text_body = f"Welcome to {APP_NAME}, {name}!\n\nYour company '{tenant_name}' is set up. Trial ends {trial_date}.\n\nLogin: {APP_URL}"
    _send(to_address, subject, html_body, text_body)


def send_welcome_async(to_address: str, name: str, tenant_name: str, trial_ends_at) -> None:
    _pool.submit(_fire, send_welcome, to_address, name, tenant_name, trial_ends_at)
