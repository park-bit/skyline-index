def get_horizon5_folds():
    return [
        {
            "fold": 1,
            "horizon": 5,
            "train_origin_years": list(range(2000, 2014)),
            "train_target_years": list(range(2005, 2019)),
            "test_origin_year": 2018,
            "test_target_year": 2023,
            "gap_origin_years": [2014, 2015, 2016, 2017],
        },
        {
            "fold": 2,
            "horizon": 5,
            "train_origin_years": list(range(2000, 2015)),
            "train_target_years": list(range(2005, 2020)),
            "test_origin_year": 2019,
            "test_target_year": 2024,
            "gap_origin_years": [2015, 2016, 2017, 2018],
        },
        {
            "fold": 3,
            "horizon": 5,
            "train_origin_years": list(range(2000, 2015)),
            "train_target_years": list(range(2005, 2020)),
            "test_origin_year": 2020,
            "test_target_year": 2025,
            "gap_origin_years": [2015, 2016, 2017, 2018, 2019],
        },
    ]


def get_horizon10_folds():
    return [
        {
            "fold": 1,
            "horizon": 10,
            "train_origin_years": list(range(2000, 2005)),
            "train_target_years": list(range(2010, 2015)),
            "test_origin_years": [2013, 2014, 2015],
            "test_target_years": [2023, 2024, 2025],
            "gap_origin_years": list(range(2005, 2013)),
            "calendar_overlap_years": [2013, 2014],
        }
    ]
