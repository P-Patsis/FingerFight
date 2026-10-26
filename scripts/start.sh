#!/bin/sh
# Serve Finger Fight for local testing on port 8082, bound to all interfaces.
# On THIS phone open http://localhost:8082  (the camera only works on localhost or https).
# Add ?sim=1 to play without a camera: http://localhost:8082/?sim=1
cd "$(dirname "$0")/.." && python3 -m http.server 8082 --bind 0.0.0.0
