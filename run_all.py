import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON = sys.executable


def run_step(description, command):
    print(f"=== {description} ===")
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode != 0:
        print(f"FAILED: {description} (exit code {result.returncode})")
        sys.exit(result.returncode)


def main():
    run_step("1. Download raw data (skips existing)", [PYTHON, "scripts/01_download.py"])
    run_step("2. Build airport-year panel", [PYTHON, "scripts/02_build_panel.py"])
    run_step("3. Run test suite", [PYTHON, "-m", "pytest", "-v"])
    print("all steps completed successfully.")


if __name__ == "__main__":
    main()
