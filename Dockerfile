FROM python:3.13-slim

# Install system dependencies needed for cryptography and snowflake-connector-python
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Django project (but exclude rsa_key.pem)
COPY . .
RUN rm -f rsa_key.pem

# Expose port 8000
EXPOSE 8000

# Run Django development server
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]