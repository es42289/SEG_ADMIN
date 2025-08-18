from django.shortcuts import redirect, render
from django.urls import reverse
from authlib.integrations.django_client import OAuth
from django.conf import settings
import json

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
    request.session['user'] = token.get('userinfo')
    return redirect('/')

def logout(request):
    request.session.clear()
    return redirect(f"https://{settings.AUTH0_DOMAIN}/v2/logout?"
                   f"returnTo={request.build_absolute_uri('/')}&"
                   f"client_id={settings.AUTH0_CLIENT_ID}")