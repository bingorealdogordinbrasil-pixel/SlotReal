const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXÃO MONGO
mongoose.connect("mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority");

// --- CRONÔMETRO GLOBAL DO SERVIDOR ---
// Ele começa em 120 e vai descendo. Ninguém reseta ele, só o próprio tempo.
let tempoServidor = 120; 

setInterval(() => {
    if (tempoServidor > 0) {
        tempoServidor--;
    } else {
        tempoServidor = 120; // Quando chega a 0, volta para 120 (2 min) automaticamente
    }
}, 1000);

// ROTA QUE O HTML VAI CONSULTAR
app.get('/api/tempo-real', (req, res) => {
    res.json({ segundos: tempoServidor });
});

// --- ROTA DE GIRO COM LUCRO (SÓ SAI A COR COM MENOS DINHEIRO) ---
app.post('/api/spin', async (req, res) => {
    const { bets } = req.body;
    let menorAposta = Math.min(...bets);
    let coresPossiveis = [];
    bets.forEach((v, i) => { if(v === menorAposta) coresPossiveis.push(i); });
    const corAlvo = coresPossiveis[Math.floor(Math.random() * coresPossiveis.length)];
    res.json({ success: true, corAlvo });
});

// (Mantenha suas outras rotas de Login, Pix e Gerente aqui embaixo...)

app.listen(10000, () => console.log("Servidor Rodando e Cronômetro Ativo"));
