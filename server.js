const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO DE DADOS CONECTADO"));

// MODELOS
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

const Saque = mongoose.model('Saque', new mongoose.Schema({
    user: String,
    valor: Number,
    chavePix: String,
    status: { type: String, default: 'Pendente' },
    data: { type: Date, default: Date.now }
}));

// --- ROTA: GERAR PIX ---
app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;
    const emailLimpo = userLogado.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + "@gmail.com";

    const data = JSON.stringify({
        transaction_amount: Number(valor),
        description: `Deposito Slot - ${userLogado}`,
        payment_method_id: "pix",
        notification_url: "https://SEU-SITE-AQUI.onrender.com/webhook", // <--- MUDE PARA O SEU LINK DO RENDER
        payer: { email: emailLimpo }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MP_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': Date.now().toString()
        }
    };

    const mpReq = https.request(options, (mpRes) => {
        let body = '';
        mpRes.on('data', (chunk) => body += chunk);
        mpRes.on('end', () => {
            const d = JSON.parse(body);
            if (d.point_of_interaction) {
                res.json({
                    success: true,
                    imagem_qr: d.point_of_interaction.transaction_data.qr_code_base64,
                    copia_e_cola: d.point_of_interaction.transaction_data.qr_code
                });
            } else { res.json({ success: false, message: d.message }); }
        });
    });
    mpReq.write(data);
    mpReq.end();
});

// --- WEBHOOK: RECEBE AVISO DE PAGAMENTO ---
app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Avisa o MP que recebeu o aviso
    const { action, data } = req.body;

    if (action === "payment.created" || action === "payment.updated") {
        const paymentId = data.id;

        // Consulta se o pagamento foi aprovado
        https.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
        }, (resMp) => {
            let body = '';
            resMp.on('data', (chunk) => body += chunk);
            resMp.on('end', async () => {
                const p = JSON.parse(body);
                if (p.status === 'approved') {
                    const valorPago = p.transaction_amount;
                    const nomeUsuario = p.description.replace("Deposito Slot - ", "");
                    
                    // Adiciona o saldo ao usuário
                    await User.findOneAndUpdate({ user: nomeUsuario }, { $inc: { saldo: valorPago } });
                    console.log(`✅ SALDO ADICIONADO: R$ ${valorPago} para ${nomeUsuario}`);
                }
            });
        });
    }
});

// --- ROTA: SOLICITAR SAQUE ---
app.post('/solicitar-saque', async (req, res) => {
    const { user, valor, chavePix } = req.body;
    const conta = await User.findOne({ user: user });

    if (conta && conta.saldo >= Number(valor)) {
        const novoSaldo = Number((conta.saldo - Number(valor)).toFixed(2));
        await User.findOneAndUpdate({ user: user }, { saldo: novoSaldo });
        await Saque.create({ user, valor: Number(valor), chavePix });
        res.json({ success: true, novoSaldo });
    } else {
        res.json({ success: false, message: "Saldo insuficiente!" });
    }
});

// --- PAINEL DO GERENTE ---
app.get('/painel-gerente', async (req, res) => {
    const pendentes = await Saque.find({ status: 'Pendente' });
    let lista = pendentes.map(p => `<li><b>${p.user}</b> pediu R$ ${p.valor} (PIX: ${p.chavePix})</li>`).join("");
    res.send(`<h2>Saques Pendentes</h2><ul>${lista}</ul>`);
});

// ROTAS PADRÃO
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, saldo: c.saldo, user: c.user, bets: c.bets });
    else res.json({ success: false });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    let menor = Math.min(...u.bets), cores = [];
    u.bets.forEach((v, i) => { if(v === menor) cores.push(i); });
    const alvo = cores[Math.floor(Math.random() * cores.length)];
    const novo = Number((u.saldo + (u.bets[alvo] * 5)).toFixed(2));
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: novo, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo: novo });
});

let tempo = 120;
setInterval(() => { if(tempo > 0) tempo--; else tempo = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo }));

app.listen(10000, () => console.log("🚀 SISTEMA COMPLETO ONLINE"));
