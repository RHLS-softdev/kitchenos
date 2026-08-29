FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# Dev server. For production, swap CMD to:
#   gunicorn -w 4 -b 0.0.0.0:5000 run:app
CMD ["flask", "run", "--host=0.0.0.0"]
