FROM ubuntu:24.04 AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake ninja-build python3 python3-venv git pkg-config \
    ca-certificates curl perl nasm autoconf automake libtool \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/conan && /opt/conan/bin/pip install --no-cache-dir conan==2.32.0
ENV PATH="/opt/conan/bin:${PATH}"
WORKDIR /src/backend
COPY backend/conanfile.py ./
RUN conan profile detect && conan install . --build=missing \
    -s compiler.cppstd=20 -s build_type=Release -c tools.cmake.cmaketoolchain:generator=Ninja
COPY backend/ ./
RUN cmake -S . -B build/Release -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=generators/conan_toolchain.cmake -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build/Release --parallel 2 \
    && ctest --test-dir build/Release --output-on-failure \
    && cmake --install build/Release --prefix /out

FROM ubuntu:24.04 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 archive
WORKDIR /app
COPY --from=build /out/bin/lostmidi_api /app/lostmidi_api
RUN mkdir /app/storage && chown archive:archive /app/storage
# Compose overrides STORAGE_PATH with its durable volume. Cloud imports require S3.
ENV BACKEND_HOST=0.0.0.0 BACKEND_PORT=8080 STORAGE_PATH=/tmp/lostmidi-storage \
    MIDI_IMPORT_ENABLED=false DB_POOL_SIZE=2 HTTP_THREADS=2 WORKER_THREADS=2 \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
USER archive
EXPOSE 8080
# The application reads the platform-provided PORT before BACKEND_PORT.
CMD ["/app/lostmidi_api"]
