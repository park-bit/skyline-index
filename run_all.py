import subprocess
import sys


def run_step(cmd):
    print(f"Running: {' '.join(cmd)}")
    res = subprocess.run(cmd, check=False)
    if res.returncode != 0:
        print(f"Command failed with exit code {res.returncode}")
        sys.exit(res.returncode)


def main():
    py = sys.executable
    steps = [
        [py, "scripts/01_download.py"],
        [py, "scripts/02_build_panel.py"],
        [py, "scripts/03_build_model_table.py"],
        [
            py,
            "-m",
            "nbconvert",
            "--to",
            "notebook",
            "--execute",
            "--inplace",
            "training_notebook.ipynb",
        ],
        [py, "scripts/05_horizon10_shrinkage.py"],
        [py, "scripts/04_build_intelligence.py"],
        [py, "-m", "pytest", "-v"],
    ]

    for step in steps:
        run_step(step)

    print("Pipeline completed successfully.")


if __name__ == "__main__":
    main()
