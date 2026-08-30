package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;

/**
 * A campaign a brand is offering to creators.
 *
 * The brand matches on the Strategy page were two fixed cards in the markup, so
 * "see all" had nothing behind it and the pay ranges were invented.
 */
@Entity
@Table(name = "brand_deals")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BrandDeal {

    @Id
    @Column(nullable = false, unique = true)
    private String id;

    @Column(nullable = false)
    private String brandName;

    /** Initials shown in the logo tile, e.g. "TG" */
    private String logo;

    /** CSS class for the logo colour, e.g. "logo-tech" */
    private String logoClass;

    /** What the brand does, e.g. "Consumer Tech & Audio" */
    private String industry;

    /** The niche this suits, used to rank matches: Tech, Travel, Gaming... */
    private String category;

    /** Sponsored Video, Product Review, Affiliate, Ambassador, Social Post, Event */
    @Column(nullable = false)
    private String dealType;

    @Column(columnDefinition = "TEXT")
    private String description;

    /** Free text, since offers include things like "+ Stay" */
    private String pay;

    /** Ordering hint for the recommended list. */
    @Builder.Default
    private int matchScore = 70;
}
