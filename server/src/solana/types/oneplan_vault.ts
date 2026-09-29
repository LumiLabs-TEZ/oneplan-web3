/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/oneplan_vault.json`.
 */
export type OneplanVault = {
  "address": "HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL",
  "metadata": {
    "name": "oneplanVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "OnePlan per-trip USDC vault"
  },
  "instructions": [
    {
      "name": "addMember",
      "discriminator": [
        13,
        116,
        123,
        130,
        126,
        198,
        57,
        34
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "vault"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "approveSpend",
      "discriminator": [
        248,
        201,
        151,
        15,
        28,
        162,
        112,
        90
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "recipientAta",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "cancelSpend",
      "discriminator": [
        122,
        254,
        101,
        132,
        241,
        232,
        205,
        179
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "closeVault",
      "discriminator": [
        141,
        103,
        17,
        126,
        72,
        75,
        29,
        29
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "vault.usdcMint",
                "account": "tripVault"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "server",
          "docs": [
            "Fee payer that funded `init_vault`; receives PDA + ATA rent back."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "deactivateMember",
      "discriminator": [
        168,
        37,
        229,
        241,
        194,
        125,
        170,
        126
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "vault"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryAta",
          "docs": [
            "OnePlan treasury USDC ATA — receives the deposit skim."
          ],
          "writable": true
        },
        {
          "name": "ownerAta",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeSettlement",
      "discriminator": [
        237,
        120,
        82,
        62,
        224,
        193,
        147,
        137
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "server",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "payouts",
          "type": {
            "vec": {
              "defined": {
                "name": "payout"
              }
            }
          }
        }
      ]
    },
    {
      "name": "initVault",
      "discriminator": [
        77,
        79,
        85,
        150,
        33,
        217,
        52,
        106
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "tripId"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "authority",
          "docs": [
            "Trip creator. Recorded as the authority that manages members."
          ],
          "signer": true
        },
        {
          "name": "server",
          "docs": [
            "Backend signer and fee payer. Recorded as the server authority."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tripId",
          "type": "u64"
        },
        {
          "name": "threshold",
          "type": "u64"
        },
        {
          "name": "dailyLimit",
          "type": "u64"
        }
      ]
    },
    {
      "name": "payoutLeave",
      "docs": [
        "Mid-trip leave payout: transfer USDC to one member and deactivate them.",
        "Does not close the vault."
      ],
      "discriminator": [
        239,
        160,
        214,
        103,
        11,
        163,
        89,
        10
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "member"
        },
        {
          "name": "memberAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "member"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "server",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "proposeSpend",
      "discriminator": [
        63,
        66,
        131,
        224,
        13,
        141,
        135,
        81
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "recipientAta"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "revertSpend",
      "discriminator": [
        112,
        67,
        14,
        89,
        255,
        85,
        8,
        103
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "receiverAta",
          "writable": true
        },
        {
          "name": "receiver",
          "docs": [
            "Owner of `receiver_ata`, signing the transfer back into the vault."
          ],
          "signer": true
        },
        {
          "name": "server",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setMemberRole",
      "docs": [
        "Marks a member as an approver (HOST / CO_HOST), or takes it away.",
        "Server-signed: who may approve is a trip decision the app owns."
      ],
      "discriminator": [
        78,
        154,
        255,
        179,
        32,
        137,
        172,
        162
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "server",
          "docs": [
            "The backend, not the trip's authority. Who may appoint a co-host is a",
            "trip decision the app owns; the chain only records the answer."
          ],
          "signer": true,
          "relations": [
            "vault"
          ]
        }
      ],
      "args": [
        {
          "name": "role",
          "type": "u8"
        }
      ]
    },
    {
      "name": "spend",
      "discriminator": [
        242,
        205,
        255,
        87,
        101,
        217,
        245,
        57
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.tripId",
                "account": "tripVault"
              }
            ]
          }
        },
        {
          "name": "vaultAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "recipientAta",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "tripVault",
      "discriminator": [
        90,
        237,
        63,
        22,
        118,
        14,
        118,
        196
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "vaultNotActive",
      "msg": "Vault is not accepting operations"
    },
    {
      "code": 6001,
      "name": "vaultNotSettling",
      "msg": "Vault must be in the Settling state"
    },
    {
      "code": 6002,
      "name": "vaultNotClosable",
      "msg": "Vault must be Closed and empty"
    },
    {
      "code": 6003,
      "name": "memberNotActive",
      "msg": "Member is not active"
    },
    {
      "code": 6004,
      "name": "memberNotFound",
      "msg": "Member not found in this vault"
    },
    {
      "code": 6005,
      "name": "vaultFull",
      "msg": "Vault already has the maximum number of members"
    },
    {
      "code": 6006,
      "name": "memberAlreadyExists",
      "msg": "Member is already in this vault"
    },
    {
      "code": 6007,
      "name": "aboveThreshold",
      "msg": "Amount exceeds the single-signature threshold"
    },
    {
      "code": 6008,
      "name": "belowThreshold",
      "msg": "Amount is within the threshold; use spend instead"
    },
    {
      "code": 6009,
      "name": "dailyLimitExceeded",
      "msg": "Daily spend limit exceeded"
    },
    {
      "code": 6010,
      "name": "insufficientFunds",
      "msg": "Insufficient vault balance"
    },
    {
      "code": 6011,
      "name": "proposalExpired",
      "msg": "Proposal has expired"
    },
    {
      "code": 6012,
      "name": "alreadyExecuted",
      "msg": "Proposal has already been executed"
    },
    {
      "code": 6013,
      "name": "duplicateApproval",
      "msg": "This member has already approved the proposal"
    },
    {
      "code": 6014,
      "name": "notAnApprover",
      "msg": "This trip restricts approvals to its host and co-host"
    },
    {
      "code": 6015,
      "name": "tooManyPayouts",
      "msg": "Too many payouts in one settlement"
    },
    {
      "code": 6016,
      "name": "payoutsExceedBalance",
      "msg": "Settlement payouts exceed the vault balance"
    },
    {
      "code": 6017,
      "name": "invariantViolated",
      "msg": "Accounting invariant violated"
    },
    {
      "code": 6018,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6019,
      "name": "noActiveSpend",
      "msg": "No active spend proposal on this vault"
    },
    {
      "code": 6020,
      "name": "spendSlotOccupied",
      "msg": "Another spend proposal is already pending"
    },
    {
      "code": 6021,
      "name": "notAllowedToCancel",
      "msg": "Only the proposer, host, or co-host may cancel"
    },
    {
      "code": 6022,
      "name": "settlementAlreadyOpen",
      "msg": "Settlement is already open on this vault"
    },
    {
      "code": 6023,
      "name": "depositTooSmall",
      "msg": "Deposit amount too small after fee"
    }
  ],
  "types": [
    {
      "name": "activeSettlement",
      "docs": [
        "Settlement batch slot on the vault account.",
        "",
        "Kept for PDA layout compatibility with vaults created before server-only",
        "`execute_settlement`. New flow never opens this; fields stay default/cleared."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payouts",
            "type": {
              "vec": {
                "defined": {
                  "name": "payout"
                }
              }
            }
          },
          {
            "name": "approvals",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "activeSpend",
      "docs": [
        "Above-threshold spend waiting for a second approval. At most one at a time."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "approvals",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "memberRecord",
      "docs": [
        "One seat in the vault's member table. No separate PDA."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "deposited",
            "type": "u64"
          },
          {
            "name": "refunded",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "role",
            "docs": [
              "Zero for an ordinary member; `ROLE_APPROVER` for HOST / CO_HOST."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "payout",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "member",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tripVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tripId",
            "docs": [
              "OnePlan trip id, also the PDA seed."
            ],
            "type": "u64"
          },
          {
            "name": "authority",
            "docs": [
              "Trip creator. May add and deactivate members."
            ],
            "type": "pubkey"
          },
          {
            "name": "server",
            "docs": [
              "Backend signer. May execute settlement and revert spends."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "threshold",
            "docs": [
              "Spends at or below this amount need one signature. Micro-USDC."
            ],
            "type": "u64"
          },
          {
            "name": "dailyLimit",
            "docs": [
              "Rolling 24h ceiling for single-signature spends. Micro-USDC."
            ],
            "type": "u64"
          },
          {
            "name": "dayStart",
            "docs": [
              "Unix timestamp at which the current daily window opened."
            ],
            "type": "i64"
          },
          {
            "name": "spentToday",
            "type": "u64"
          },
          {
            "name": "memberCount",
            "type": "u16"
          },
          {
            "name": "approverCount",
            "docs": [
              "Members with `ROLE_APPROVER`. Restriction kicks in at",
              "`MIN_APPROVERS_TO_RESTRICT`."
            ],
            "type": "u16"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalSpent",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "vaultStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "members",
            "type": {
              "vec": {
                "defined": {
                  "name": "memberRecord"
                }
              }
            }
          },
          {
            "name": "hasActiveSpend",
            "type": "bool"
          },
          {
            "name": "activeSpend",
            "type": {
              "defined": {
                "name": "activeSpend"
              }
            }
          },
          {
            "name": "hasSettlement",
            "type": "bool"
          },
          {
            "name": "settlement",
            "type": {
              "defined": {
                "name": "activeSettlement"
              }
            }
          }
        ]
      }
    },
    {
      "name": "vaultStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "settling"
          },
          {
            "name": "closed"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "daySeconds",
      "docs": [
        "Length of the rolling window for the daily spend ceiling."
      ],
      "type": "i64",
      "value": "86400"
    },
    {
      "name": "depositFeeBps",
      "docs": [
        "Deposit skim in basis points (10 = 0.1%)."
      ],
      "type": "u64",
      "value": "10"
    },
    {
      "name": "minApproversToRestrict",
      "docs": [
        "Approvals are restricted to designated approvers only once a trip has at",
        "least this many. Below it any active member may approve, which is what stops",
        "a trip whose sole approver raised the payment from deadlocking."
      ],
      "type": "u16",
      "value": "2"
    },
    {
      "name": "proposalTtlSeconds",
      "docs": [
        "Proposals expire 24 hours after creation."
      ],
      "type": "i64",
      "value": "86400"
    },
    {
      "name": "roleApprover",
      "docs": [
        "`MemberRecord::role` for someone who may approve (HOST / CO_HOST in the app)."
      ],
      "type": "u8",
      "value": "1"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
