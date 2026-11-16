FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py industrial.py .
COPY init/002-entity-telemetry.sql .
COPY init/003-snmp-atomic-batches.sql .
COPY init/004-industrial-observations.sql .

EXPOSE 8080

CMD ["python", "app.py"]
