import hashlib
import secrets
from datetime import datetime, timedelta
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.core.mail import send_mail
from django.conf import settings
from .models import UserAccount

# In-memory token cache (backed by token verification)
TOKEN_CACHE = {}

# In-memory OTP storage: email -> { 'otp': '123456', 'expires': datetime }
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
        'created_at': datetime.utcnow()
    }
    return token

def get_user_from_token(token):
    if not token:
        return None
    session = TOKEN_CACHE.get(token)
    if session:
        try:
            return UserAccount.objects.get(user_id=session['user_id'])
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
    OTP_STORE[email.lower()] = {
        'otp': otp,
        'expires': datetime.utcnow() + timedelta(minutes=10)
    }

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
    record = OTP_STORE.get(email.lower())
    if not record:
        return False, "No OTP request found for this email"
    if datetime.utcnow() > record['expires']:
        del OTP_STORE[email.lower()]
        return False, "OTP has expired. Please request a new one"
    if record['otp'] != str(otp).strip():
        return False, "Invalid OTP verification code"
    del OTP_STORE[email.lower()]
    return True, "OTP verified successfully"
