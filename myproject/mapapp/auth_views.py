from django.shortcuts import redirect
from django.urls import reverse
from django.contrib.auth import get_user_model, login as auth_login, logout as auth_logout
from authlib.integrations.django_client import OAuth
from django.conf import settings

oauth = OAuth()
oauth.register(
    'auth0',
    client_id=settings.AUTH0_CLIENT_ID,
    client_secret=settings.AUTH0_CLIENT_SECRET,
    api_base_url=f'https://{settings.AUTH0_DOMAIN}',
    access_token_url=f'https://{settings.AUTH0_DOMAIN}/oauth/token',
    authorize_url=f'https://{settings.AUTH0_DOMAIN}/authorize',
    jwks_uri=f'https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json',
    client_kwargs={'scope': 'openid profile email'},
)

def login(request):
    return oauth.auth0.authorize_redirect(
        request, request.build_absolute_uri(reverse('callback'))
    )

def callback(request):
    token = oauth.auth0.authorize_access_token(request)
    userinfo = token.get('userinfo') or {}
    request.session['user'] = userinfo

    user_model = get_user_model()
    email = userinfo.get('email')
    sub = userinfo.get('sub') or email

    if not sub:
        raise RuntimeError('Auth0 response missing user identifier')

    username = email or sub
    user, _ = user_model.objects.get_or_create(
        username=username,
        defaults={'email': email or ''},
    )
    if email and user.email != email:
        user.email = email
        user.save(update_fields=['email'])

    if not user.has_usable_password():
        user.set_unusable_password()
        user.save(update_fields=['password'])

    auth_login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    return redirect('/')

def logout(request):
    auth_logout(request)
    request.session.clear()
    return redirect(f"https://{settings.AUTH0_DOMAIN}/v2/logout?"
                   f"returnTo={request.build_absolute_uri('/')}&"
                   f"client_id={settings.AUTH0_CLIENT_ID}")