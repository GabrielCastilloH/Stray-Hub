from enum import Enum

from pydantic import BaseModel


class AnimalSpecies(str, Enum):
    dog = "dog"
    cat = "cat"


class Sex(str, Enum):
    male = "male"
    female = "female"
    unknown = "unknown"


class GeoPointIn(BaseModel):
    latitude: float
    longitude: float
