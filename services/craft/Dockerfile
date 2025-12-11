FROM python:3.10-slim

WORKDIR /app

# System deps for opencv
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/craft/requirements.txt .
ENV PIP_DEFAULT_TIMEOUT=120
RUN pip install --no-cache-dir -r requirements.txt

# Copy weights and app
COPY assets/craft_mlt_25k.pth /app/assets/craft_mlt_25k.pth
COPY services/craft/app.py /app/app.py

ENV WEIGHTS_PATH=/app/assets/craft_mlt_25k.pth
ENV PORT=5000

EXPOSE 5000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
