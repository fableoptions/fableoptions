/**
 * Fable's independent integration review, 2026-11-17.
 * Source links are evidence for investigation, NOT endorsements, audits
 * of deployed binaries, live liquidity, or proof of legal availability.
 */
export interface VenueCandidate {
  id:"epicentral"|"opta"|"skew";
  name:string;
  claim:string;
  evidenceUrls:string[];
  status:"not_verified_for_fable";
  blockers:string[];
  callableIntegrationAvailable:false;
}
const common=[
  "No Fable-verified mainnet program deployment and deployed code match",
  "No independent audit report reviewed against deployed program binary",
  "No funded executable quote for the requested Pump.fun mint",
  "No independent expiry oracle and manipulation-resistance validation",
  "No legal and jurisdictional clearance"
];
export const VENUE_CANDIDATES:readonly VenueCandidate[]=[
  {
    id:"epicentral",name:"Epicentral / Solana Options Standard",
    claim:"Epicentral's current beta markets American-style options on nearly any Solana token; this is a claim, not validated Fable support.",
    evidenceUrls:["https://beta.epicentral.markets/","https://github.com/EpicentralLabs","https://github.com/sec3-service/reports"],
    status:"not_verified_for_fable",callableIntegrationAvailable:false,
    blockers:[
      ...common,
      "Current beta reports test funds and zero published trade/TVL counters at review",
      "Old public SDK link redirected to a currently unavailable repository; no verified current integration IDL/SDK",
      "Sec3 audit relationship announced, but no matching public Epicentral report found in the auditor's index",
      "No documented permissionless support confirmed for newly created Pump.fun mints"
    ]
  },
  {
    id:"opta",name:"Opta",
    claim:"Open-source project claims permissionless Pyth-priced token options using Token-2022.",
    evidenceUrls:["https://github.com/nankolib/opta"],
    status:"not_verified_for_fable",callableIntegrationAvailable:false,
    blockers:[
      ...common,
      "Only Pyth-priced assets are described; fresh Pump.fun mints generally cannot be assumed to have Pyth feeds",
      "Self-reported audit fixes in repository are not an independent certification"
    ]
  },
  {
    id:"skew",name:"Skew",
    claim:"Devnet RFQ protocol and SDK published for selected supported assets.",
    evidenceUrls:["https://github.com/skew-labs/skewarchive"],
    status:"not_verified_for_fable",callableIntegrationAvailable:false,
    blockers:[
      ...common,
      "Repository describes a devnet deployment and predefined launch asset panel, not arbitrary Pump.fun options"
    ]
  }
] as const;
export function venueCandidateReport(){
  return { asOf:"2026-11-17",contractExecutionEnabled:false,
    noVenueCertified:true,candidates:VENUE_CANDIDATES };
}
