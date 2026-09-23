#!/bin/bash
cd "$(dirname "$0")"
node server.js &
sleep 1
open http://localhost:5500 2>/dev/null || xdg-open http://localhost:5500 2>/dev/null
wait
