FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True OMP_NUM_THREADS=4
WORKDIR /service
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.txt -c requirements.lock.txt
COPY server.py ./
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
