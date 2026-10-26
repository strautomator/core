// Strautomator Core: AWIN types

/**
 * A product row from AWIN CSV feeds.
 */
export interface AwinProduct {
    product_name: string
    brand_name: string
    product_type: string
    product_short_description: string
    description: string
    specifications: string
    promotional_text: string
    category_name: string
    merchant_name: string
    merchant_category: string
    merchant_image_url: string
    aw_image_url: string
    aw_deep_link: string
    in_stock: string
    display_price: string
}

/**
 * A promotion from AWIN.
 */
export interface AwinPromotion {
    promotionId: number
    title: string
    description: string
    status: string
    startDate: string
    endDate: string
    url: string
    urlTracking: string
    advertiser: {
        name: string
    }
    voucher?: {
        code: string
    }
}
