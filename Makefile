.PHONY: install download panel sensitivity model-table baselines figures train radar test all

install:
	pip install -r requirements.txt

download:
	python scripts/01_download.py

panel:
	python scripts/02_build_panel.py

sensitivity:
	python scripts/03_index_sensitivity.py

model-table:
	python scripts/04_build_model_table.py

baselines:
	python scripts/05_evaluate_baselines.py

figures:
	python scripts/06_make_figures.py

train:
	python scripts/07_train_and_evaluate.py

radar:
	python scripts/08_run_radar.py

test:
	pytest -v

all: download panel sensitivity model-table baselines figures train radar test
