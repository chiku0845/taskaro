import hashlib
import secrets
from datetime import datetime, timedelta
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from .models import UserAccount, AuthToken, EmailOtp

# Fast in-memory token cache backed by database persistence
TOKEN_CACHE = {}

# Fast in-memory OTP cache backed by database persistence
OTP_STORE = {}

def hash_password(password, salt=None):
    if not salt:
        salt = secrets.token_hex(16)
    # Compatible with Node.js crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512')
    h = hashlib.pbkdf2_hmac('sha512', password.encode('utf-8'), salt.encode('utf-8'), 1000, 64)
    return h.hex(), salt

def verify_password(password, stored_hash, salt):
    try:
        h, _ = hash_password(password, salt)
        return secrets.compare_digest(h, stored_hash)
    except Exception:
        return False

def generate_auth_token(user):
    token = secrets.token_hex(32)
    TOKEN_CACHE[token] = {
        'user_id': user.user_id,
        'email': user.email,
        'role': user.role,
        'name': user.name,
        'created_at': timezone.now()
    }
    try:
        AuthToken.objects.update_or_create(
            token=token,
            defaults={'user_id': user.user_id}
        )
    except Exception as e:
        print(f"[AuthToken Warning] Could not persist token to DB: {e}")
    return token

def get_user_from_token(token):
    if not token:
        return None
    session = TOKEN_CACHE.get(token)
    user_id = session.get('user_id') if session else None
    if not user_id:
        try:
            auth_record = AuthToken.objects.filter(token=token).first()
            if auth_record:
                user_id = auth_record.user_id
                TOKEN_CACHE[token] = {
                    'user_id': user_id,
                    'created_at': auth_record.created_at
                }
        except Exception:
            user_id = None

    if user_id:
        try:
            return UserAccount.objects.get(user_id=user_id)
        except UserAccount.DoesNotExist:
            return None
    return None

class BearerTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return None

        token = parts[1]
        user = get_user_from_token(token)
        if not user:
            raise AuthenticationFailed('Invalid or expired authentication token')

        if user.account_status != 'active':
            raise AuthenticationFailed('This account has been deactivated')

        return (user, token)

# Email OTP (SMTP) Utility
def send_email_otp(email):
    otp = str(secrets.randbelow(900000) + 100000)  # 6-digit numeric OTP
    expires = timezone.now() + timedelta(minutes=10)
    OTP_STORE[email.lower()] = {
        'otp': otp,
        'expires': expires
    }
    try:
        EmailOtp.objects.update_or_create(
            email=email.lower(),
            defaults={'otp': otp, 'expires_at': expires}
        )
    except Exception as e:
        print(f"[EmailOtp Warning] Could not persist OTP to DB: {e}")

    subject = 'Taskaro - Verification Code'
    message = f"Hello,\n\nYour Taskaro verification code is: {otp}\n\nThis code will expire in 10 minutes.\n\nBest regards,\nTaskaro Team"
    try:
        if settings.EMAIL_HOST_USER:
            send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
        else:
            # Fallback log in dev
            print(f"[Taskaro SMTP OTP] Code for {email}: {otp}")
        return True, "OTP sent successfully"
    except Exception as e:
        print(f"[Taskaro SMTP Error] Failed to send OTP: {e}")
        return False, str(e)

def verify_email_otp(email, otp):
    email_clean = email.lower().strip()
    record = OTP_STORE.get(email_clean)
    stored_otp = record.get('otp') if record else None
    expires_at = record.get('expires') if record else None

    if not stored_otp:
        try:
            db_record = EmailOtp.objects.filter(email=email_clean).first()
            if db_record:
                stored_otp = db_record.otp
                expires_at = db_record.expires_at
        except Exception:
            pass

    if not stored_otp:
        return False, "No OTP request found for this email"

    if timezone.now() > expires_at:
        OTP_STORE.pop(email_clean, None)
        try:
            EmailOtp.objects.filter(email=email_clean).delete()
        except Exception:
            pass
        return False, "OTP has expired. Please request a new one"

    if stored_otp != str(otp).strip():
        return False, "Invalid OTP verification code"

    OTP_STORE.pop(email_clean, None)
    try:
        EmailOtp.objects.filter(email=email_clean).delete()
    except Exception:
        pass
    return True, "OTP verified successfully"
