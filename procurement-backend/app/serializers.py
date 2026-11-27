from .models import ItemVariant
from .schemas import VariantOut


def variant_out(v: ItemVariant) -> VariantOut:
    size = v.size_option.label if v.size_option else None
    return VariantOut(
        id=v.id, item_id=v.item_id, item_name=v.item.name,
        category_name=v.item.category.name if v.item.category else None,
        display_name=f"{v.item.name} - {size}" if size else v.item.name,
        sku=v.sku, description=v.description, size_option_id=v.size_option_id, size_label=size,
        uom_id=v.uom_id, uom_code=v.uom.code, uom_symbol=v.uom.symbol,
        allows_decimal=v.uom.allows_decimal, attributes=v.attributes or {}, is_active=v.is_active,
    )
