import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import transactionsRouter    from './src/routes/transactions.js';
import institutionsRouter    from './src/routes/institutions.js';
import stripeDonationsRouter from './src/routes/stripeDonations.js';
import bankTransfersRouter   from './src/routes/bankTransfers.js';
import receiptProxyRouter    from './src/routes/receiptProxy.js';
import gmailSyncRouter       from './src/routes/gmailSync.js';
import paymentFailuresRouter  from './src/routes/paymentFailures.js';
import standingOrdersRouter  from './src/routes/standingOrders.js';
import checkAllowedRouter    from './src/routes/checkAllowed.js';
import adminUsersRouter      from './src/routes/adminUsers.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/check-allowed',    checkAllowedRouter);
app.use('/api/admin/users',      adminUsersRouter);
app.use('/api/transactions',     transactionsRouter);
app.use('/api/institutions',     institutionsRouter);
app.use('/api/stripe-donations', stripeDonationsRouter);
app.use('/api/bank-transfers',   bankTransfersRouter);
app.use('/api/receipt-proxy',    receiptProxyRouter);
app.use('/api/gmail-sync',       gmailSyncRouter);
app.use('/api/payment-failures', paymentFailuresRouter);
app.use('/api/standing-orders',  standingOrdersRouter);

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
