#!/bin/bash
# Convert SVG icons to PNG using Inkscape or other tools

# Check if inkscape is available
if command -v inkscape &> /dev/null; then
    inkscape --export-type=png --export-width=16 --export-height=16 icon16.svg -o icon16.png
    inkscape --export-type=png --export-width=48 --export-height=48 icon48.svg -o icon48.png
    inkscape --export-type=png --export-width=128 --export-height=128 icon128.svg -o icon128.png
    echo "Icons generated successfully with Inkscape"
else
    echo "Inkscape not found. Please install it or use an online converter."
    echo "SVG icons are provided as fallback."
fi
