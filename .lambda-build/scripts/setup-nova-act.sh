#!/bin/bash
# Setup script for Nova Act in WSL Ubuntu
# Run this inside WSL: bash /mnt/f/overEmployed/scripts/setup-nova-act.sh

set -e

echo "=== OverEmployed: Nova Act WSL Setup ==="
echo ""

# Check Python version
echo "Checking Python..."
python3 --version || { echo "ERROR: Python 3 not found. Install with: sudo apt install python3 python3-pip"; exit 1; }

# Install pip if needed
echo "Checking pip..."
pip3 --version || { echo "Installing pip..."; sudo apt install -y python3-pip; }

# Install Nova Act
echo ""
echo "Installing nova-act..."
pip3 install nova-act --quiet

# Install Playwright (Python version for Nova Act)
echo "Installing playwright..."
pip3 install playwright --quiet

# Install Chromium for Playwright
echo "Installing Chromium browser..."
python3 -m playwright install chromium

# Check for API key
echo ""
if [ -z "$NOVA_ACT_API_KEY" ]; then
    echo "WARNING: NOVA_ACT_API_KEY environment variable is not set."
    echo "Get your key from: https://nova.amazon.com/act"
    echo "Set it with: export NOVA_ACT_API_KEY='your_key_here'"
    echo "Add to ~/.bashrc for persistence."
else
    echo "NOVA_ACT_API_KEY is set."
fi

# Verify installation
echo ""
echo "Verifying installation..."
python3 -c "import nova_act; print('nova-act:', nova_act.__version__)" 2>/dev/null && echo "nova-act: OK" || echo "nova-act: NOT INSTALLED (optional - install later)"
python3 -c "import playwright; print('playwright: OK')" 2>/dev/null || echo "playwright: FAILED"

echo ""
echo "=== Setup Complete ==="
echo "Test with: python3 /mnt/f/overEmployed/scripts/nova_act_agent.py"
