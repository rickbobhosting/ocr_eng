# Complete Guide: Creating Custom n8n Nodes (Self-Hosted)

## Prerequisites

### System Requirements
- **Node.js**: Version 20 or higher
- **npm**: Included with Node.js (or use pnpm/yarn)
- **Git**: For version control
- **TypeScript**: For development
- **n8n**: Installed globally

### Install Global Dependencies
```bash
# Install n8n globally
npm install n8n -g

# Install TypeScript globally (optional but recommended)
npm install -g typescript

# Verify installations
node --version  # Should be 20+
npm --version
n8n --version
```

## Step 1: Set Up Development Environment

### 1.1 Clone the Starter Repository
```bash
# Clone the official n8n nodes starter
git clone https://github.com/n8n-io/n8n-nodes-starter.git
cd n8n-nodes-starter

# Install dependencies
npm install
```

### 1.2 Understand the Project Structure
```
n8n-nodes-starter/
├── credentials/              # Authentication credentials
│   └── ExampleApi.credentials.ts
├── nodes/                   # Node implementations
│   └── ExampleNode/
│       ├── ExampleNode.node.ts
│       ├── ExampleNode.node.json
│       └── icon.svg
├── package.json            # Package configuration
├── tsconfig.json          # TypeScript configuration
├── gulpfile.js           # Build configuration
└── README.md
```

### 1.3 Configure Package.json
```json
{
  "name": "n8n-nodes-your-integration",
  "version": "1.0.0",
  "description": "n8n nodes for Your Integration",
  "keywords": [
    "n8n-community-node-package",
    "n8n-node"
  ],
  "license": "MIT",
  "homepage": "https://n8n.io",
  "author": {
    "name": "Your Name",
    "email": "your.email@example.com"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/n8n-nodes-your-integration.git"
  },
  "main": "index.js",
  "scripts": {
    "build": "tsc && gulp build:icons",
    "dev": "tsc --watch",
    "format": "prettier nodes credentials --write",
    "lint": "eslint nodes credentials package.json",
    "lintfix": "eslint nodes credentials package.json --fix",
    "prepublishOnly": "npm run build && npm run lint -c .eslintrc.prepublish.js nodes credentials package.json"
  },
  "files": [
    "dist"
  ],
  "n8n": {
    "n8nNodesApiVersion": 1,
    "credentials": [
      "dist/credentials/YourApi.credentials.js"
    ],
    "nodes": [
      "dist/nodes/YourNode/YourNode.node.js"
    ]
  },
  "devDependencies": {
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "eslint-plugin-n8n-nodes-base": "^1.0.0",
    "gulp": "^4.0.2",
    "n8n-workflow": "*",
    "prettier": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Step 2: Create Your First Custom Node

### 2.1 Plan Your Node
Before coding, define:
- **Node purpose**: What does it do?
- **Operations**: What actions can users perform?
- **Parameters**: What inputs does it need?
- **API integration**: What external service (if any)?
- **Authentication**: What credentials are required?

### 2.2 Create the Node Directory
```bash
# Create your node directory
mkdir nodes/WeatherNode
cd nodes/WeatherNode
```

### 2.3 Create the Node Icon
Create a `icon.svg` file (60x60px recommended):
```svg
<svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <circle cx="30" cy="30" r="25" fill="#4A90E2"/>
  <text x="30" y="35" text-anchor="middle" fill="white" font-family="Arial" font-size="12">W</text>
</svg>
```

### 2.4 Create the Node Implementation

#### WeatherNode.node.ts
```typescript
import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
    IHttpRequestMethods,
    IHttpRequestOptions,
} from 'n8n-workflow';

export class WeatherNode implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Weather Node',
        name: 'weatherNode',
        icon: 'file:icon.svg',
        group: ['input'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Get weather information',
        defaults: {
            name: 'Weather Node',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'weatherApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Get Current Weather',
                        value: 'getCurrentWeather',
                        description: 'Get current weather for a location',
                        action: 'Get current weather',
                    },
                    {
                        name: 'Get Forecast',
                        value: 'getForecast',
                        description: 'Get weather forecast for a location',
                        action: 'Get weather forecast',
                    },
                ],
                default: 'getCurrentWeather',
            },
            {
                displayName: 'Location',
                name: 'location',
                type: 'string',
                default: '',
                placeholder: 'London, UK',
                description: 'The location to get weather for',
                required: true,
            },
            {
                displayName: 'Units',
                name: 'units',
                type: 'options',
                options: [
                    {
                        name: 'Metric',
                        value: 'metric',
                    },
                    {
                        name: 'Imperial',
                        value: 'imperial',
                    },
                    {
                        name: 'Kelvin',
                        value: 'standard',
                    },
                ],
                default: 'metric',
                description: 'Temperature units',
            },
            {
                displayName: 'Days',
                name: 'days',
                type: 'number',
                displayOptions: {
                    show: {
                        operation: ['getForecast'],
                    },
                },
                default: 5,
                description: 'Number of days to forecast',
                typeOptions: {
                    minValue: 1,
                    maxValue: 16,
                },
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i) as string;
                const location = this.getNodeParameter('location', i) as string;
                const units = this.getNodeParameter('units', i) as string;
                const credentials = await this.getCredentials('weatherApi', i);

                if (!location) {
                    throw new NodeOperationError(
                        this.getNode(),
                        'Location is required',
                        { itemIndex: i }
                    );
                }

                let endpoint = '';
                const queryParams: Record<string, string> = {
                    q: location,
                    appid: credentials.apiKey as string,
                    units,
                };

                switch (operation) {
                    case 'getCurrentWeather':
                        endpoint = 'weather';
                        break;
                    case 'getForecast':
                        endpoint = 'forecast';
                        const days = this.getNodeParameter('days', i) as number;
                        queryParams.cnt = (days * 8).toString(); // 8 forecasts per day (3-hour intervals)
                        break;
                    default:
                        throw new NodeOperationError(
                            this.getNode(),
                            `Unknown operation: ${operation}`,
                            { itemIndex: i }
                        );
                }

                const options: IHttpRequestOptions = {
                    method: 'GET' as IHttpRequestMethods,
                    uri: `https://api.openweathermap.org/data/2.5/${endpoint}`,
                    qs: queryParams,
                    json: true,
                };

                const response = await this.helpers.request(options);

                returnData.push({
                    json: {
                        operation,
                        location,
                        units,
                        data: response,
                        timestamp: new Date().toISOString(),
                    },
                    pairedItem: { item: i },
                });

            } catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                        },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                
                if (error instanceof NodeOperationError) {
                    throw error;
                }
                
                throw new NodeOperationError(
                    this.getNode(),
                    `Error processing item: ${error.message}`,
                    { itemIndex: i, cause: error }
                );
            }
        }

        return [returnData];
    }
}
```

## Step 3: Create Credentials

### 3.1 Create Credential File

#### credentials/WeatherApi.credentials.ts
```typescript
import {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class WeatherApi implements ICredentialType {
    name = 'weatherApi';
    displayName = 'Weather API';
    documentationUrl = 'https://openweathermap.org/api';
    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your OpenWeatherMap API key',
            required: true,
        },
    ];

    // Optional: Test the credentials
    test: ICredentialTestRequest = {
        request: {
            baseURL: 'https://api.openweathermap.org/data/2.5',
            url: '/weather',
            qs: {
                q: 'London',
                appid: '={{$credentials.apiKey}}',
            },
        },
    };

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            qs: {
                appid: '={{$credentials.apiKey}}',
            },
        },
    };
}
```

## Step 4: Build and Test Locally

### 4.1 Build the Node
```bash
# From the project root
npm run build

# This compiles TypeScript and processes icons
```

### 4.2 Link for Local Development
```bash
# In your node package directory
npm link

# In your n8n custom nodes directory (usually ~/.n8n/custom)
cd ~/.n8n/custom
npm link n8n-nodes-your-integration
```

### 4.3 Start n8n with Custom Nodes
```bash
# Set environment variable for custom nodes
export N8N_CUSTOM_EXTENSIONS=~/.n8n/custom

# Start n8n
n8n start
```

### 4.4 Test Your Node
1. Open n8n in your browser (default: http://localhost:5678)
2. Create a new workflow
3. Look for your "Weather Node" in the node panel
4. Add the node to your workflow
5. Configure credentials and test

## Step 5: Advanced Features

### 5.1 Add Complex Parameters

#### Collection Parameter Example
```typescript
{
    displayName: 'Additional Options',
    name: 'additionalOptions',
    type: 'collection',
    placeholder: 'Add Option',
    default: {},
    options: [
        {
            displayName: 'Language',
            name: 'language',
            type: 'options',
            options: [
                { name: 'English', value: 'en' },
                { name: 'Spanish', value: 'es' },
                { name: 'French', value: 'fr' },
            ],
            default: 'en',
        },
        {
            displayName: 'Include Alerts',
            name: 'includeAlerts',
            type: 'boolean',
            default: false,
        },
    ],
}
```

### 5.2 Add Data Transformation
```typescript
// In your execute method
const transformedData = {
    temperature: response.main.temp,
    humidity: response.main.humidity,
    description: response.weather[0].description,
    windSpeed: response.wind.speed,
    pressure: response.main.pressure,
    visibility: response.visibility,
    location: {
        name: response.name,
        country: response.sys.country,
        coordinates: {
            lat: response.coord.lat,
            lon: response.coord.lon,
        },
    },
    timestamp: new Date().toISOString(),
};
```

### 5.3 Add Binary Data Support
```typescript
// For handling file uploads/downloads
{
    displayName: 'Download Weather Map',
    name: 'downloadMap',
    type: 'boolean',
    default: false,
    description: 'Download weather map as image',
}

// In execute method
if (downloadMap) {
    const mapOptions: IHttpRequestOptions = {
        method: 'GET',
        uri: `https://tile.openweathermap.org/map/precipitation_new/1/1/1.png?appid=${credentials.apiKey}`,
        encoding: null, // For binary data
    };

    const mapData = await this.helpers.request(mapOptions);
    
    returnData.push({
        json: response,
        binary: {
            data: {
                data: mapData.toString('base64'),
                mimeType: 'image/png',
                fileName: `weather-map-${Date.now()}.png`,
            },
        },
        pairedItem: { item: i },
    });
}
```

## Step 6: Error Handling Best Practices

### 6.1 Comprehensive Error Handling
```typescript
try {
    // API call logic
} catch (error) {
    // Handle specific HTTP errors
    if (error.response) {
        const statusCode = error.response.status;
        const errorMessage = error.response.data?.message || error.message;
        
        switch (statusCode) {
            case 401:
                throw new NodeOperationError(
                    this.getNode(),
                    'Invalid API key. Please check your credentials.',
                    { itemIndex: i }
                );
            case 404:
                throw new NodeOperationError(
                    this.getNode(),
                    `Location "${location}" not found.`,
                    { itemIndex: i }
                );
            case 429:
                throw new NodeOperationError(
                    this.getNode(),
                    'API rate limit exceeded. Please try again later.',
                    { itemIndex: i }
                );
            default:
                throw new NodeOperationError(
                    this.getNode(),
                    `API error (${statusCode}): ${errorMessage}`,
                    { itemIndex: i }
                );
        }
    }
    
    // Handle network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new NodeOperationError(
            this.getNode(),
            'Network error: Unable to connect to the weather service.',
            { itemIndex: i }
        );
    }
    
    // Generic error handling
    throw new NodeOperationError(
        this.getNode(),
        `Unexpected error: ${error.message}`,
        { itemIndex: i, cause: error }
    );
}
```

## Step 7: Testing and Validation

### 7.1 Run Linter
```bash
npm run lint
npm run lintfix  # Auto-fix issues
```

### 7.2 Test Different Scenarios
- Valid and invalid inputs
- Different parameter combinations
- Network failures
- Invalid credentials
- Large datasets

### 7.3 Create Example Workflow
```json
{
  "name": "Weather Node Example",
  "nodes": [
    {
      "parameters": {},
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "operation": "getCurrentWeather",
        "location": "London, UK",
        "units": "metric"
      },
      "name": "Weather Node",
      "type": "n8n-nodes-your-integration.weatherNode",
      "typeVersion": 1,
      "position": [460, 300]
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [
        [
          {
            "node": "Weather Node",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## Step 8: Publishing and Distribution

### 8.1 Prepare for Publishing
```bash
# Final build and lint
npm run build
npm run lint

# Test locally one more time
npm link
```

### 8.2 Update Package Version
```bash
npm version patch  # or minor/major
```

### 8.3 Publish to npm
```bash
# Login to npm (if not already)
npm login

# Publish the package
npm publish

# Tag as community node
npm dist-tag add n8n-nodes-your-integration@1.0.0 community
```

### 8.4 Install in Production
```bash
# On your n8n server
cd ~/.n8n/custom
npm install n8n-nodes-your-integration

# Restart n8n
pm2 restart n8n  # or your process manager
```

## Step 9: Maintenance and Updates

### 9.1 Update Dependencies
```bash
npm update
npm audit fix
```

### 9.2 Version Management
- Follow semantic versioning (semver)
- Document breaking changes
- Provide migration guides

### 9.3 Community Support
- Respond to GitHub issues
- Update documentation
- Provide example workflows

## Common Troubleshooting

### Node Not Appearing
- Check `package.json` n8n configuration
- Verify build completed successfully
- Restart n8n after installation
- Check n8n logs for errors

### TypeScript Errors
- Ensure n8n-workflow types are installed
- Check TypeScript version compatibility
- Run `npm run build` to see compilation errors

### Runtime Errors
- Use `console.log()` for debugging (visible in n8n logs)
- Check network connectivity
- Validate API credentials
- Review parameter validation logic

### Performance Issues
- Implement proper error handling
- Use batch processing for large datasets
- Add request timeouts
- Consider rate limiting

## Best Practices Summary

1. **Follow n8n Conventions**: Use established patterns and naming
2. **Comprehensive Testing**: Test all scenarios and edge cases
3. **Clear Documentation**: Provide examples and troubleshooting guides
4. **Error Handling**: Implement robust error handling and user feedback
5. **Performance**: Optimize for production workloads
6. **Security**: Validate inputs and secure credential handling
7. **Community**: Engage with users and maintain your nodes

This guide provides everything you need to create, test, and deploy custom n8n nodes. Start with a simple node and gradually add complexity as you become more familiar with the n8n ecosystem.