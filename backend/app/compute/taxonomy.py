"""物种分类字符串解析工具。

多张物种图表都会用到同一套命名规则，所以这里保持为公共工具，而不是
拆到单个图表模块里。输入通常是 MetaPhlAn 风格的分类串：
`k__Bacteria|p__Firmicutes|c__...|g__...|s__...`。
"""

from __future__ import annotations


def get_level(taxonomy: str, level: str) -> str | None:
    """从完整分类串中取出指定层级的名称。

    Args:
        taxonomy: 完整分类串。
        level: 单字母层级前缀，如 `p` 表示 phylum，`g` 表示 genus。

    Returns:
        找到时返回去掉 `p__`/`g__` 前缀后的值；缺失或为空时返回 None。
    """

    prefix = f"{level}__"
    for part in str(taxonomy).split("|"):
        if part.startswith(prefix):
            value = part[len(prefix):].strip()
            return value or None
    return None


def short_name(taxonomy: str, max_len: int | None = None) -> str:
    """生成适合图表标签显示的短名称。

    优先使用 species；如果 species 不包含 genus，则拼成 `genus_species`。
    如果没有 species，就退回 genus 或分类串最后一级。`max_len` 用于热图列名
    等空间较小的位置。
    """

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
    """一次性拆出旭日图需要的层级链。

    Returns:
        包含 `phylum`、`class`、`genus`、`species` 的 dict。缺失层级统一用
        `Unclassified` 或短名称兜底，避免树结构出现空节点。
    """

    return {
        "phylum": get_level(taxonomy, "p") or "Unclassified",
        "class": get_level(taxonomy, "c") or "Unclassified",
        "genus": get_level(taxonomy, "g") or "Unclassified",
        "species": get_level(taxonomy, "s") or short_name(taxonomy),
    }
