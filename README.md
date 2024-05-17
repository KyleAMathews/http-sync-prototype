# http-sync-prototype

## Client Algorithm

`GET /shapes/{shape_id}`

Server returns a JSON Line of operations

Client tracks the the last lsn it sees in the parsed objects

Then it repeatedly fetches the following until it sees a JSON object of type `up-to-date`

`GET /shapes/{shape_id}?lsn={last_lsn}`

Once it sees `up-to-date`, the client knows it's caught up to the latest data.

There it can poll the same URL, always with the latest lsn, to get real-time updates.

## Running the demos

1. Install depndencies
Run `npm install` in both the root and `demo-web` directories.

1. Start the server

`npx tsx start-server.ts`

2. Run the bash client

`./bash-client.bash`

3. Run the web client

`cd demo-web && npm run dev`

4. Update data

Update a row:
`curl -X POST http://localhost:3000/shape/issues/update-row/1`

Append a row:
`curl -X POST http://localhost:3000/shape/issues/append-row`
