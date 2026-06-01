from __future__ import annotations


def get_level(taxonomy: str, level: str) -> str | None:
    prefix = f"{level}__"
    for part in str(taxonomy).split("|"):
        if part.startswith(prefix):
            value = part[len(prefix):].strip()
            return value or None
    return None


def short_name(taxonomy: str, max_len: int | None = None) -> str:
    species = get_level(taxonomy, "s")
    genus = get_level(taxonomy, "g")

    if genus and species:
        name = species if species.startswith(genus) else f"{genus}_{species}"
    elif species:
        name = species
    elif genus:
        name = f"{genus}_sp."
    else:
        last = str(taxonomy).split("|")[-1]
        name = last.split("__", 1)[-1] if "__" in last else last

    if max_len and len(name) > max_len:
        return f"{name[:max_len - 1]}…"
    return name.replace(" ", "_")


def taxonomy_chain(taxonomy: str) -> dict[str, str]:
    return {
        "phylum": get_level(taxonomy, "p") or "Unclassified",
        "class": get_level(taxonomy, "c") or "Unclassified",
        "genus": get_level(taxonomy, "g") or "Unclassified",
        "species": get_level(taxonomy, "s") or short_name(taxonomy),
    }
