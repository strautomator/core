// Strautomator Core: Affiliates types

/**
 * Affiliate product.
 */
export interface AffiliateProduct {
    /** Product name. */
    name: string
    /** Product category. */
    category: string
    /** Publisher. */
    publisher: string
    /** Target URL. */
    url: string
}

/**
 * A product row from AWIN CSV feeds.
 */
export interface AwinCsvProduct {
    product_name: string
    brand_name: string
    description: string
    category_name: string
    merchant_category: string
    merchant_image_url: string
    aw_image_url: string
    aw_deep_link: string
    in_stock: string
    currency: string
}
