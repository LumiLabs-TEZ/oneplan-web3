# OnePlan OpenAPI Spec

This directory contains the shared OpenAPI specification generated from the NestJS server. The SwiftUI app uses this spec to auto-generate a type-safe API client.

## Regenerating the spec

From the `server/` directory:

```bash
pnpm run openapi:generate
```

This builds the server and writes `openapi.json` to this directory.

## Swagger UI

When the server is running (`pnpm run start:dev`), interactive docs are available at:

- **Swagger UI**: http://localhost:3000/docs
- **JSON spec**: http://localhost:3000/docs/json
- **YAML spec**: http://localhost:3000/docs/yaml

---

## SwiftUI Integration Guide

### 1. Add Swift Package Dependencies

In Xcode, go to **File > Add Package Dependencies** and add these three packages:

| Package | URL | Version |
|---------|-----|---------|
| swift-openapi-generator | `https://github.com/apple/swift-openapi-generator` | 1.0.0+ |
| swift-openapi-runtime | `https://github.com/apple/swift-openapi-runtime` | 1.0.0+ |
| swift-openapi-urlsession | `https://github.com/apple/swift-openapi-urlsession` | 1.0.0+ |

### 2. Create the OpenAPI config file

Create `openapi-generator-config.yaml` in your Xcode project (e.g., inside an `OpenAPI/` group):

```yaml
generate:
  - types
  - client
accessModifier: internal
```

### 3. Add the spec file

Copy or symlink `openapi.json` from this directory into the same location as the config file:

```bash
# From the ios/OnePlan/OnePlan/ directory:
ln -s ../../../../openapi/openapi.json OpenAPI/openapi.json
```

### 4. Add the build plugin

In Xcode:
1. Select the **OnePlan** target
2. Go to **Build Phases**
3. Add **OpenAPIGenerator** as a Build Tool Plugin
4. Point it to `openapi.json` and `openapi-generator-config.yaml`

### 5. Use the generated client

```swift
import OpenAPIRuntime
import OpenAPIURLSession

// Create the client
let client = Client(
    serverURL: URL(string: "http://localhost:3000")!,
    transport: URLSessionTransport()
)

// List all countries
let countriesResponse = try await client.listCountries()
let countries = try countriesResponse.ok.body.json

// List states for a country
let statesResponse = try await client.listStatesByCountry(
    path: .init(id: 233)  // e.g., United States
)
let states = try statesResponse.ok.body.json

// List cities for a state (with pagination and search)
let citiesResponse = try await client.listCitiesByState(
    path: .init(id: 1416),  // e.g., California
    query: .init(search: "Los", take: 50)
)
let cityPage = try citiesResponse.ok.body.json
let cities = cityPage.data
let nextCursor = cityPage.nextCursor  // nil if last page
```

### Generated Types

The generator creates Swift types matching the API schemas:

| OpenAPI Schema | Swift Type |
|---------------|------------|
| `CountryDto` | `Components.Schemas.CountryDto` |
| `StateDto` | `Components.Schemas.StateDto` |
| `CityDto` | `Components.Schemas.CityDto` |
| `CityPageDto` | `Components.Schemas.CityPageDto` |

### Workflow

When the API changes:

1. Make changes in `server/src/`
2. Run `pnpm run openapi:generate` from `server/`
3. Build the iOS project — the Swift client regenerates automatically
4. Commit both `openapi/openapi.json` and any server changes together
