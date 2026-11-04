FROM python:3.12-slim
RUN pip install --no-cache-dir piper-tts==1.4.2
ARG VOICE_REVISION=e7229f7d33a10e145e109b886d661984201ac3c4
RUN mkdir /models && python -c "import urllib.request; base='https://huggingface.co/rhasspy/piper-voices/resolve/${VOICE_REVISION}/ru/ru_RU/denis/medium/'; [urllib.request.urlretrieve(base+f, '/models/'+f) for f in ['ru_RU-denis-medium.onnx','ru_RU-denis-medium.onnx.json','MODEL_CARD']]"
WORKDIR /app
COPY server.py .
USER 65534:65534
ENV OMP_NUM_THREADS=2
EXPOSE 8000
CMD ["python", "server.py"]
