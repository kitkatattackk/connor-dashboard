#!/bin/bash
echo "Connor Dashboard — Build Script"
echo "================================="
echo ""

# Check Node
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js not found. Download from https://nodejs.org"
  exit 1
fi

echo "Installing dependencies..."
npm install

echo ""
echo "Building Mac app..."
npm run build:mac

echo ""
echo "Done! Check the dist/ folder for the .dmg file."
