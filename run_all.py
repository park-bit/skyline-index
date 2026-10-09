import subprocess
import sys


def run_step(cmd):
    print(f"Running: {' '.join(cmd)}")
    res = subprocess.run(cmd)
    if res.returncode != 0:
        print(f"Command failed with exit code {res.returncode}")
        sys.exit(res.returncode)


def main():
    py = sys.executable
    steps = [
        [py, "scripts/01_download.py"],
        [py, "scripts/02_build_panel.py"],
        [py, "scripts/03_index_sensitivity.py"],
        [py, "scripts/04_build_model_table.py"],
        [py, "scripts/05_evaluate_baselines.py"],
        [py, "scripts/06_make_figures.py"],
        [py, "scripts/07_train_and_evaluate.py"],
        [py, "scripts/08_run_radar.py"],
        [py, "-m", "pytest", "-v"],
    ]

    for step in steps:
        run_step(step)

    print("Pipeline completed successfully.")


if __name__ == "__main__":
    main()
