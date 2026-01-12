const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO MERCADO PAGO (TOKEN REAL) ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const client = new MercadoPagoConfig({ accessToken: MP_TOKEN });
const payment = new Payment(client);

const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// --- RELÓGIO DO SERVIDOR ---
let tempoServidor = 120; 
setInterval(() => {
    if (tempoServidor > 0) tempoServidor--;
    else tempoServidor = 120;
}, 1000);

app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempoServidor }));

// --- GERAÇÃO DE PIX REAL ---
app.post('/gerar-pix', async (req, res) => {
    try {
        const { valor, userLogado } = req.body;
        const body = {
            transaction_amount: Number(valor),
            description: `Depósito Slot - ${userLogado}`,
            payment_method_id: 'pix',
            payer: {
                email: `${userLogado}@slot.com`,
                first_name: userLogado
            },
            // Metadata serve para o Webhook saber quem é o dono do dinheiro depois
            metadata: { user_id: userLogado }
        };

        const response = await payment.create({ body });
        res.json({
            success: true,
            imagem_qr: response.point_of_interaction.transaction_data.qr_code_base64,
            copia_e_cola: response.point_of_interaction.transaction_data.qr_code
        });
    } catch (e) {
        console.error(e);
        res.json({ success: false });
    }
});

// --- WEBHOOK: CRÉDITO AUTOMÁTICO ---
app.post('/webhooks', async (req, res) => {
    const { action, data } = req.body;
    
    // Se um pagamento foi aprovado
    if (action === "payment.created" || req.query["data.id"]) {
        const paymentId = data?.id || req.query["data.id"];
        
        try {
            const p = await payment.get({ id: paymentId });
            
            if (p.status === 'approved') {
                const valorPago = p.transaction_amount;
                const usuario = p.metadata.user_id;

                // Adiciona o saldo no banco de dados automaticamente
                await User.findOneAndUpdate(
                    { user: usuario },
                    { $inc: { saldo: valorPago } }
                );
                console.log(`💰 SALDO CREDITADO: R$ ${valorPago} para ${usuario}`);
            }
        } catch (e) { console.error("Erro no Webhook", e); }
    }
    res.sendStatus(200);
});

// --- ROTAS DO JOGO ---
app.post('/auth/login', async (req, res) => {
    const conta = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (conta) res.json({ success: true, saldo: conta.saldo, user: conta.user, bets: conta.bets });
    else res.json({ success: false });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const userDb = await User.findOne({ user: req.body.user });
    let asApostas = userDb.bets;
    let menor = Math.min(...asApostas);
    let cores = [];
    asApostas.forEach((v, i) => { if(v === menor) cores.push(i); });
    const alvo = cores[Math.floor(Math.random() * cores.length)];
    
    const premio = asApostas[alvo] * 5.0;
    const novoSaldo = Number((userDb.saldo + premio).toFixed(2));
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: novoSaldo, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR RODANDO COM PIX REAL`));
