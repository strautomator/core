// Strautomator Web: Custom Google Maps styles

/**
 * A single Google Maps style rule.
 */
export interface GoogleMapStyle {
    featureType: string
    elementType: string
    stylers: {[key: string]: string | number}[]
}

/**
 * Custom Google Maps styles used on the map page.
 */
export const googleMapStyles: Record<string, GoogleMapStyle[]> = {
    bikeLight: [
        {
            featureType: "administrative",
            elementType: "labels.text.fill",
            stylers: [
                {
                    color: "#878787"
                }
            ]
        },
        {
            featureType: "administrative.country",
            elementType: "geometry.stroke",
            stylers: [
                {
                    weight: "0.5"
                }
            ]
        },
        {
            featureType: "administrative.country",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "administrative.province",
            elementType: "geometry.stroke",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "administrative.province",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "administrative.locality",
            elementType: "labels",
            stylers: [
                {
                    visibility: "on"
                }
            ]
        },
        {
            featureType: "administrative.locality",
            elementType: "labels.icon",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "administrative.neighborhood",
            elementType: "all",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "administrative.neighborhood",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "administrative.land_parcel",
            elementType: "all",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "administrative.land_parcel",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "landscape.man_made",
            elementType: "all",
            stylers: [
                {
                    color: "#f1efe2"
                }
            ]
        },
        {
            featureType: "landscape.natural",
            elementType: "all",
            stylers: [
                {
                    color: "#dce9d0"
                }
            ]
        },
        {
            featureType: "poi",
            elementType: "all",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "road",
            elementType: "all",
            stylers: [
                {
                    saturation: -100
                },
                {
                    lightness: 45
                }
            ]
        },
        {
            featureType: "road.highway",
            elementType: "all",
            stylers: [
                {
                    visibility: "simplified"
                }
            ]
        },
        {
            featureType: "road.highway",
            elementType: "geometry.fill",
            stylers: [
                {
                    color: "#ffffff"
                },
                {
                    weight: "2"
                }
            ]
        },
        {
            featureType: "road.highway",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "road.highway.controlled_access",
            elementType: "geometry.fill",
            stylers: [
                {
                    color: "#e8c8c8"
                }
            ]
        },
        {
            featureType: "road.arterial",
            elementType: "geometry",
            stylers: [
                {
                    weight: "2"
                }
            ]
        },
        {
            featureType: "road.arterial",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "road.arterial",
            elementType: "labels.icon",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "road.local",
            elementType: "geometry.fill",
            stylers: [
                {
                    weight: "1"
                },
                {
                    saturation: "0"
                },
                {
                    color: "#ffffff"
                }
            ]
        },
        {
            featureType: "road.local",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "transit",
            elementType: "all",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "water",
            elementType: "all",
            stylers: [
                {
                    color: "#b2e0f2"
                },
                {
                    visibility: "on"
                }
            ]
        },
        {
            featureType: "water",
            elementType: "geometry",
            stylers: [
                {
                    visibility: "on"
                }
            ]
        },
        {
            featureType: "water",
            elementType: "labels",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        },
        {
            featureType: "water",
            elementType: "labels.icon",
            stylers: [
                {
                    visibility: "off"
                }
            ]
        }
    ]
}
