const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÕES ---
const SENHA_GERENTE = "admin123"; 
const MP_TOKEN = "TEST-5872111440785194-010218-09559312066d92484080808080808080-12345678"; // COLOQUE SEU TOKEN AQUI
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

// --- RELÓGIO ---
let tempoServidor = 120; 
setInterval(() => {
    if (tempoServidor > 0) tempoServidor--;
    else tempoServidor = 120;
}, 1000);

app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempoServidor }));

// --- PIX REAL (MERCADO PAGO) ---
app.post('/gerar-pix', async (req, res) => {
    try {
        const { valor, userLogado } = req.body;
        const body = {
            transaction_amount: Number(valor),
            description: `Deposito - ${userLogado}`,
            payment_method_id: 'pix',
            payer: { email: `${userLogado}@slotreal.com` }
        };

        const response = await payment.create({ body });
        res.json({
            success: true,
            imagem_qr: response.point_of_interaction.transaction_data.qr_code_base64,
            copia_e_cola: response.point_of_interaction.transaction_data.qr_code
        });
    } catch (e) {
        console.log(e);
        res.json({ success: false });
    }
});

// --- MOTOR DE GIRO E SALVAMENTO ---
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
    if (!userDb) return res.json({ success: false });

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
app.listen(PORT, () => console.log(`🚀 SERVIDOR OK`));
