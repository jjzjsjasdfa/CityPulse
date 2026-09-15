"""Approximate BD-09/GCJ-02 normalization for the application's WGS84 map.

Adapted from https://github.com/wandergis/coordTransform_py (MIT):
Copyright (c) 2015 WangMing

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

import math


def valid_coordinates(longitude: float, latitude: float) -> bool:
    return (
        math.isfinite(longitude)
        and math.isfinite(latitude)
        and -180 <= longitude <= 180
        and -90 <= latitude <= 90
        and (longitude, latitude) != (0, 0)
    )


def _offset(longitude: float, latitude: float) -> tuple[float, float]:
    x, y = longitude - 105, latitude - 35
    latitude_shift = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    longitude_shift = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    common = (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
    latitude_shift += common + (20 * math.sin(y * math.pi) + 40 * math.sin(y / 3 * math.pi)) * 2 / 3
    latitude_shift += (160 * math.sin(y / 12 * math.pi) + 320 * math.sin(y / 30 * math.pi)) * 2 / 3
    longitude_shift += (
        common + (20 * math.sin(x * math.pi) + 40 * math.sin(x / 3 * math.pi)) * 2 / 3
    )
    longitude_shift += (150 * math.sin(x / 12 * math.pi) + 300 * math.sin(x / 30 * math.pi)) * 2 / 3
    rad = math.radians(latitude)
    eccentricity = 0.00669342162296594323
    magic = 1 - eccentricity * math.sin(rad) ** 2
    latitude_shift *= 180 / ((6378245 * (1 - eccentricity) / (magic * math.sqrt(magic))) * math.pi)
    longitude_shift *= 180 / ((6378245 / math.sqrt(magic)) * math.cos(rad) * math.pi)
    return longitude_shift, latitude_shift


def to_wgs84(longitude: float, latitude: float, system: str) -> tuple[float, float]:
    if not valid_coordinates(longitude, latitude):
        raise ValueError("Invalid source coordinates")
    if system == "wgs84":
        return longitude, latitude
    if system == "bd09":
        x, y = longitude - 0.0065, latitude - 0.006
        factor = math.pi * 3000 / 180
        radius = math.hypot(x, y) - 0.00002 * math.sin(y * factor)
        angle = math.atan2(y, x) - 0.000003 * math.cos(x * factor)
        longitude, latitude = radius * math.cos(angle), radius * math.sin(angle)
    elif system != "gcj02":
        raise ValueError("Unknown coordinate system")
    if not (73.66 < longitude < 135.05 and 3.86 < latitude < 53.55):
        return longitude, latitude
    guess_lon, guess_lat = longitude, latitude
    for _ in range(5):
        delta_lon, delta_lat = _offset(guess_lon, guess_lat)
        guess_lon, guess_lat = longitude - delta_lon, latitude - delta_lat
    return round(guess_lon, 7), round(guess_lat, 7)
